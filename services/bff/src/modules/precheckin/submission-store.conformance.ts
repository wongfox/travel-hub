import { beforeEach, describe, expect, it } from "vitest";
import {
  AlreadyHandedOffError,
  AlreadySubmittedError,
  type CreatePrecheckinSubmissionInput,
  type PrecheckinSubmissionStore,
  type StoredPrecheckinImage,
} from "./ports.js";

function fakeImage(seed: string): StoredPrecheckinImage {
  return {
    objectKey: `${seed}-key`,
    wrappedDataKey: Buffer.from(`${seed}-wrapped`),
    iv: Buffer.from(`${seed}-iv`),
    authTag: Buffer.from(`${seed}-tag`),
  };
}

const T0 = "2026-03-10T12:00:00.000Z";
const FAR_PURGE_AFTER = "2099-01-01T00:00:00.000Z";
const DAY_MS = 24 * 60 * 60 * 1000;

function input(overrides: Partial<CreatePrecheckinSubmissionInput> = {}): CreatePrecheckinSubmissionInput {
  return {
    reservationRef: "RES-1001",
    passengerRef: "PAX-1",
    docType: "DNI",
    consentRecordId: "consent-1",
    photo: fakeImage("photo"),
    idFront: fakeImage("id-front"),
    idBack: null,
    purgeAfter: FAR_PURGE_AFTER,
    ...overrides,
  };
}

export interface PrecheckinSubmissionStoreHarness {
  /** A store over EMPTY state (the Postgres harness truncates first) whose `submittedAt` is stamped from `now()`. */
  make(now: () => Date): Promise<PrecheckinSubmissionStore>;
}

/**
 * Shared conformance suite for every `PrecheckinSubmissionStore` implementation
 * (in-memory and Postgres): exactly one submission per passenger (even under
 * concurrency: the `already_submitted` guarantee), the handoff/purge scans and
 * their boundaries, `purgeAfter` that only ever tightens, and crypto-shredding.
 */
export function describePrecheckinSubmissionStoreContract(
  name: string,
  harness: PrecheckinSubmissionStoreHarness,
  options: { skip?: boolean } = {},
): void {
  describe.skipIf(options.skip === true)(`PrecheckinSubmissionStore contract: ${name}`, () => {
    let store: PrecheckinSubmissionStore;
    beforeEach(async () => {
      store = await harness.make(() => new Date(T0));
    });

    it("returns null when no submission exists for a passenger", async () => {
      expect(await store.findByPassenger("RES-1001", "PAX-1")).toBeNull();
    });

    it("creates a 'received' submission stamped from the clock with every field (incl. envelope buffers) round-tripped", async () => {
      const created = await store.create(input({ docType: "PASSPORT", idBack: fakeImage("id-back") }));

      expect(created.id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(created).toEqual({
        id: created.id,
        reservationRef: "RES-1001",
        passengerRef: "PAX-1",
        docType: "PASSPORT",
        consentRecordId: "consent-1",
        status: "received",
        photo: fakeImage("photo"),
        idFront: fakeImage("id-front"),
        idBack: fakeImage("id-back"),
        submittedAt: T0,
        handedOffAt: null,
        purgeAfter: FAR_PURGE_AFTER,
        purgedAt: null,
      });
      expect(Buffer.isBuffer(created.photo.wrappedDataKey)).toBe(true);
      expect(await store.findByPassenger("RES-1001", "PAX-1")).toEqual(created);
    });

    it("keeps a missing id_back as null", async () => {
      const created = await store.create(input());

      expect(created.idBack).toBeNull();
      expect((await store.findByPassenger("RES-1001", "PAX-1"))?.idBack).toBeNull();
    });

    it("scopes lookups by both reservation and passenger independently", async () => {
      await store.create(input());

      expect(await store.findByPassenger("RES-1001", "PAX-2")).toBeNull();
      expect(await store.findByPassenger("RES-9999", "PAX-1")).toBeNull();
    });

    it("REJECTS a second create() for the same passenger with AlreadySubmittedError and leaves the first submission untouched", async () => {
      const first = await store.create(input());

      await expect(store.create(input({ docType: "PASSPORT", consentRecordId: "consent-2" }))).rejects.toThrow(
        AlreadySubmittedError,
      );

      expect(await store.findByPassenger("RES-1001", "PAX-1")).toEqual(first);
      expect(await store.listPendingHandoff()).toHaveLength(1);
    });

    it("lets exactly one of several concurrent creates for the same passenger win, the rest being AlreadySubmittedError", async () => {
      const results = await Promise.allSettled(Array.from({ length: 8 }, () => store.create(input())));

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      for (const result of results) {
        if (result.status === "rejected") expect(result.reason).toBeInstanceOf(AlreadySubmittedError);
      }
      expect(await store.listPendingHandoff()).toHaveLength(1);
    });

    it("allows a different passenger or reservation to submit independently", async () => {
      await store.create(input());

      await expect(store.create(input({ passengerRef: "PAX-2" }))).resolves.toMatchObject({ passengerRef: "PAX-2" });
      await expect(store.create(input({ reservationRef: "RES-2" }))).resolves.toMatchObject({ reservationRef: "RES-2" });
    });

    it("listPendingHandoff returns only 'received' submissions, in insertion order", async () => {
      const a = await store.create(input({ passengerRef: "PAX-1" }));
      await store.create(input({ passengerRef: "PAX-2" }));
      await store.create(input({ passengerRef: "PAX-3" }));
      await store.markHandedOff(a.id, T0, FAR_PURGE_AFTER);

      expect((await store.listPendingHandoff()).map((s) => s.passengerRef)).toEqual(["PAX-2", "PAX-3"]);
    });

    it("markHandedOff flips status, records handedOffAt and tightens purgeAfter", async () => {
      const created = await store.create(input());

      const updated = await store.markHandedOff(created.id, "2026-03-11T00:00:00.000Z", "2026-03-18T00:00:00.000Z");

      expect(updated).toMatchObject({
        id: created.id,
        status: "handed_off",
        handedOffAt: "2026-03-11T00:00:00.000Z",
        purgeAfter: "2026-03-18T00:00:00.000Z",
      });
      expect(await store.findByPassenger("RES-1001", "PAX-1")).toEqual(updated);
    });

    it("markHandedOff NEVER loosens purgeAfter (a later candidate keeps the earlier value)", async () => {
      const created = await store.create(input({ purgeAfter: "2026-04-01T00:00:00.000Z" }));

      const updated = await store.markHandedOff(created.id, "2026-03-11T00:00:00.000Z", "2026-09-01T00:00:00.000Z");

      expect(updated.purgeAfter).toBe("2026-04-01T00:00:00.000Z");
      expect(updated.status).toBe("handed_off");
    });

    it("markHandedOff is a compare-and-swap: a second call throws AlreadyHandedOffError and keeps the first handedOffAt and purgeAfter", async () => {
      const created = await store.create(input({ purgeAfter: "2026-12-01T00:00:00.000Z" }));
      const first = await store.markHandedOff(created.id, "2026-03-11T00:00:00.000Z", "2026-03-18T00:00:00.000Z");

      await expect(store.markHandedOff(created.id, "2026-03-12T00:00:00.000Z", "2026-03-10T00:00:00.000Z")).rejects.toThrow(
        AlreadyHandedOffError,
      );

      expect(await store.findByPassenger("RES-1001", "PAX-1")).toEqual(first);
    });

    it("lets exactly one of several overlapping markHandedOff calls win, the rest being AlreadyHandedOffError", async () => {
      const created = await store.create(input());
      const stamps = [1, 2, 3, 4, 5].map((d) => `2026-03-1${d}T00:00:00.000Z`);

      const results = await Promise.allSettled(stamps.map((at) => store.markHandedOff(created.id, at, FAR_PURGE_AFTER)));

      const won = results.filter((r) => r.status === "fulfilled");
      expect(won).toHaveLength(1);
      for (const result of results) {
        if (result.status === "rejected") expect(result.reason).toBeInstanceOf(AlreadyHandedOffError);
      }
      const stored = await store.findByPassenger("RES-1001", "PAX-1");
      expect(stored?.status).toBe("handed_off");
      expect(stored).toEqual((won[0] as PromiseFulfilledResult<unknown>).value);
    });

    it("markHandedOff throws for an unknown (or non-uuid) id and for an already purged submission", async () => {
      await expect(store.markHandedOff("not-a-real-id", T0, T0)).rejects.toThrow();
      await expect(store.markHandedOff("00000000-0000-4000-8000-000000000000", T0, T0)).rejects.toThrow();

      const created = await store.create(input({ purgeAfter: T0 }));
      await store.markPurged(created.id, T0);
      await expect(store.markHandedOff(created.id, T0, T0)).rejects.toThrow();
      expect((await store.findByPassenger("RES-1001", "PAX-1"))?.status).toBe("purged");
    });

    it("listPastPurgeAfter includes a row exactly AT purgeAfter and excludes one a millisecond before it", async () => {
      const due = await store.create(input({ purgeAfter: "2026-06-01T00:00:00.000Z" }));
      const dueMs = new Date(due.purgeAfter).getTime();

      expect(await store.listPastPurgeAfter(new Date(dueMs))).toEqual([due]);
      expect(await store.listPastPurgeAfter(new Date(dueMs - 1))).toEqual([]);
      expect(await store.listPastPurgeAfter(new Date(dueMs + DAY_MS))).toEqual([due]);
    });

    it("listPastPurgeAfter returns only due submissions (handed off or not) and never a purged one", async () => {
      const due = await store.create(input({ passengerRef: "PAX-1", purgeAfter: "2026-01-01T00:00:00.000Z" }));
      const dueHandedOff = await store.create(input({ passengerRef: "PAX-2", purgeAfter: "2026-01-02T00:00:00.000Z" }));
      await store.markHandedOff(dueHandedOff.id, "2025-12-01T00:00:00.000Z", "2026-01-02T00:00:00.000Z");
      await store.create(input({ passengerRef: "PAX-3", purgeAfter: FAR_PURGE_AFTER }));
      const purged = await store.create(input({ passengerRef: "PAX-4", purgeAfter: "2026-01-01T00:00:00.000Z" }));
      await store.markPurged(purged.id, "2026-02-01T00:00:00.000Z");

      const results = await store.listPastPurgeAfter(new Date("2026-06-01T00:00:00.000Z"));

      expect(results.map((s) => s.passengerRef)).toEqual(["PAX-1", "PAX-2"]);
      expect(results[0]?.id).toBe(due.id);
    });

    it("markPurged flips status, records purgedAt and crypto-shreds every image's key material while keeping object keys", async () => {
      const created = await store.create(input({ idBack: fakeImage("id-back") }));

      const purged = await store.markPurged(created.id, "2026-06-01T00:00:00.000Z");

      expect(purged.status).toBe("purged");
      expect(purged.purgedAt).toBe("2026-06-01T00:00:00.000Z");
      for (const image of [purged.photo, purged.idFront, purged.idBack]) {
        expect(image).not.toBeNull();
        expect(image?.wrappedDataKey.length).toBe(0);
        expect(image?.iv.length).toBe(0);
        expect(image?.authTag.length).toBe(0);
      }
      expect(purged.photo.objectKey).toBe("photo-key");
      expect(purged.idFront.objectKey).toBe("id-front-key");
      expect(purged.idBack?.objectKey).toBe("id-back-key");
      expect(await store.findByPassenger("RES-1001", "PAX-1")).toEqual(purged);
    });

    it("keeps a purged submission as the passenger's record (already_submitted still applies; status is purged)", async () => {
      const created = await store.create(input());
      await store.markPurged(created.id, T0);

      expect((await store.findByPassenger("RES-1001", "PAX-1"))?.status).toBe("purged");
      await expect(store.create(input())).rejects.toThrow(AlreadySubmittedError);
      expect(await store.listPendingHandoff()).toEqual([]);
    });

    it("markPurged is idempotent: a repeated purge keeps the FIRST purgedAt, stays shredded and does not throw", async () => {
      const created = await store.create(input({ idBack: fakeImage("id-back") }));
      const first = await store.markPurged(created.id, "2026-06-01T00:00:00.000Z");

      const second = await store.markPurged(created.id, "2026-07-01T00:00:00.000Z");

      expect(second).toEqual(first);
      expect(second.purgedAt).toBe("2026-06-01T00:00:00.000Z");
      expect((await store.findByPassenger("RES-1001", "PAX-1"))?.purgedAt).toBe("2026-06-01T00:00:00.000Z");
      for (const image of [second.photo, second.idFront, second.idBack]) {
        expect(image?.wrappedDataKey.length).toBe(0);
      }
    });

    it("concurrent markPurged calls all resolve and the earliest-applied purgedAt wins (one of the candidates, never overwritten)", async () => {
      const created = await store.create(input());
      const candidates = ["2026-06-01T00:00:00.000Z", "2026-06-02T00:00:00.000Z", "2026-06-03T00:00:00.000Z"];

      const results = await Promise.all(candidates.map((at) => store.markPurged(created.id, at)));

      const winner = (await store.findByPassenger("RES-1001", "PAX-1"))?.purgedAt;
      expect(candidates).toContain(winner);
      for (const result of results) expect(result.purgedAt).toBe(winner);
    });

    it("markPurged throws for an unknown (or non-uuid) id", async () => {
      await expect(store.markPurged("not-a-real-id", T0)).rejects.toThrow();
      await expect(store.markPurged("00000000-0000-4000-8000-000000000000", T0)).rejects.toThrow();
    });
  });
}
