import { describe, expect, it } from "vitest";
import { createInMemorySubmissionStore } from "./submission-store.js";
import type { StoredPrecheckinImage } from "./ports.js";

function fakeImage(seed: string): StoredPrecheckinImage {
  return {
    objectKey: `${seed}-key`,
    wrappedDataKey: Buffer.from(`${seed}-wrapped`),
    iv: Buffer.from(`${seed}-iv`),
    authTag: Buffer.from(`${seed}-tag`),
  };
}

const PURGE_AFTER = "2026-06-01T00:00:00.000Z";

describe("createInMemorySubmissionStore", () => {
  it("returns null when no submission exists for a passenger", async () => {
    const store = createInMemorySubmissionStore();

    const result = await store.findByPassenger("RES-1001", "PAX-1");

    expect(result).toBeNull();
  });

  it("creates a submission with status 'received' and makes it findable by the same reservation+passenger", async () => {
    const store = createInMemorySubmissionStore();

    const created = await store.create({
      reservationRef: "RES-1001",
      passengerRef: "PAX-1",
      docType: "DNI",
      consentRecordId: "consent-1",
      photo: fakeImage("photo"),
      idFront: fakeImage("id-front"),
      idBack: null,
      purgeAfter: PURGE_AFTER,
    });

    expect(created.id).toEqual(expect.any(String));
    expect(created.submittedAt).toEqual(expect.any(String));
    expect(created.status).toBe("received");
    expect(created.handedOffAt).toBeNull();
    expect(created.purgedAt).toBeNull();
    expect(created.purgeAfter).toBe(PURGE_AFTER);

    const found = await store.findByPassenger("RES-1001", "PAX-1");
    expect(found).toEqual(created);
  });

  it("scopes lookups by both reservation and passenger independently", async () => {
    const store = createInMemorySubmissionStore();
    await store.create({
      reservationRef: "RES-1001",
      passengerRef: "PAX-1",
      docType: "PASSPORT",
      consentRecordId: "consent-2",
      photo: fakeImage("photo2"),
      idFront: fakeImage("id-front2"),
      idBack: fakeImage("id-back2"),
      purgeAfter: PURGE_AFTER,
    });

    expect(await store.findByPassenger("RES-1001", "PAX-2")).toBeNull();
    expect(await store.findByPassenger("RES-9999", "PAX-1")).toBeNull();
    const found = await store.findByPassenger("RES-1001", "PAX-1");
    expect(found?.docType).toBe("PASSPORT");
    expect(found?.idBack).not.toBeNull();
  });

  it("listPendingHandoff returns only 'received' submissions", async () => {
    const store = createInMemorySubmissionStore();
    const a = await store.create({
      reservationRef: "RES-1001",
      passengerRef: "PAX-1",
      docType: "DNI",
      consentRecordId: "consent-1",
      photo: fakeImage("a-photo"),
      idFront: fakeImage("a-id-front"),
      idBack: null,
      purgeAfter: PURGE_AFTER,
    });
    await store.create({
      reservationRef: "RES-1001",
      passengerRef: "PAX-2",
      docType: "DNI",
      consentRecordId: "consent-2",
      photo: fakeImage("b-photo"),
      idFront: fakeImage("b-id-front"),
      idBack: null,
      purgeAfter: PURGE_AFTER,
    });

    await store.markHandedOff(a.id, "2026-01-02T00:00:00.000Z", "2026-01-09T00:00:00.000Z");

    const pending = await store.listPendingHandoff();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.passengerRef).toBe("PAX-2");
  });

  it("markHandedOff flips status, records handedOffAt, and tightens purgeAfter", async () => {
    const store = createInMemorySubmissionStore();
    const created = await store.create({
      reservationRef: "RES-1001",
      passengerRef: "PAX-1",
      docType: "DNI",
      consentRecordId: "consent-1",
      photo: fakeImage("photo"),
      idFront: fakeImage("id-front"),
      idBack: null,
      purgeAfter: "2026-06-01T00:00:00.000Z", // far-out trip-end + retention baseline
    });

    const updated = await store.markHandedOff(
      created.id,
      "2026-01-02T00:00:00.000Z",
      "2026-01-09T00:00:00.000Z", // sooner handoff-grace candidate
    );

    expect(updated.status).toBe("handed_off");
    expect(updated.handedOffAt).toBe("2026-01-02T00:00:00.000Z");
    expect(updated.purgeAfter).toBe("2026-01-09T00:00:00.000Z");

    const refetched = await store.findByPassenger("RES-1001", "PAX-1");
    expect(refetched?.status).toBe("handed_off");
  });

  it("markHandedOff throws for an unknown submission id", async () => {
    const store = createInMemorySubmissionStore();

    await expect(store.markHandedOff("not-a-real-id", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z")).rejects.toThrow();
  });

  it("listPastPurgeAfter returns only non-purged submissions whose purgeAfter has elapsed", async () => {
    const store = createInMemorySubmissionStore();
    const due = await store.create({
      reservationRef: "RES-1001",
      passengerRef: "PAX-1",
      docType: "DNI",
      consentRecordId: "consent-1",
      photo: fakeImage("due-photo"),
      idFront: fakeImage("due-id-front"),
      idBack: null,
      purgeAfter: "2026-01-01T00:00:00.000Z",
    });
    await store.create({
      reservationRef: "RES-1001",
      passengerRef: "PAX-2",
      docType: "DNI",
      consentRecordId: "consent-2",
      photo: fakeImage("notdue-photo"),
      idFront: fakeImage("notdue-id-front"),
      idBack: null,
      purgeAfter: "2099-01-01T00:00:00.000Z",
    });

    const asOf = new Date("2026-06-01T00:00:00.000Z");
    const results = await store.listPastPurgeAfter(asOf);

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe(due.id);
  });

  it("listPastPurgeAfter excludes submissions already marked purged", async () => {
    const store = createInMemorySubmissionStore();
    const due = await store.create({
      reservationRef: "RES-1001",
      passengerRef: "PAX-1",
      docType: "DNI",
      consentRecordId: "consent-1",
      photo: fakeImage("photo"),
      idFront: fakeImage("id-front"),
      idBack: null,
      purgeAfter: "2026-01-01T00:00:00.000Z",
    });
    await store.markPurged(due.id, "2026-06-02T00:00:00.000Z");

    const results = await store.listPastPurgeAfter(new Date("2026-06-03T00:00:00.000Z"));

    expect(results).toHaveLength(0);
  });

  it("markPurged flips status, records purgedAt, and crypto-shreds every stored image's key material", async () => {
    const store = createInMemorySubmissionStore();
    const created = await store.create({
      reservationRef: "RES-1001",
      passengerRef: "PAX-1",
      docType: "DNI",
      consentRecordId: "consent-1",
      photo: fakeImage("photo"),
      idFront: fakeImage("id-front"),
      idBack: fakeImage("id-back"),
      purgeAfter: "2026-01-01T00:00:00.000Z",
    });

    const purged = await store.markPurged(created.id, "2026-06-01T00:00:00.000Z");

    expect(purged.status).toBe("purged");
    expect(purged.purgedAt).toBe("2026-06-01T00:00:00.000Z");
    // Object keys are kept as a historical reference (the object itself is deleted by the caller/document store);
    // the wrapped DEK/IV/auth tag are zeroed so the ciphertext can never be decrypted again (crypto-shredding).
    expect(purged.photo.objectKey).toBe("photo-key");
    expect(purged.photo.wrappedDataKey.length).toBe(0);
    expect(purged.photo.iv.length).toBe(0);
    expect(purged.photo.authTag.length).toBe(0);
    expect(purged.idFront.wrappedDataKey.length).toBe(0);
    expect(purged.idBack?.wrappedDataKey.length).toBe(0);
  });

  it("markPurged throws for an unknown submission id", async () => {
    const store = createInMemorySubmissionStore();

    await expect(store.markPurged("not-a-real-id", "2026-01-01T00:00:00.000Z")).rejects.toThrow();
  });
});
