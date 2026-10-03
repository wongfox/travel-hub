import type { StaffAlertPayload } from "contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { DuplicateStaffAlertError, type StaffAlertStore } from "./ports.js";

const PR_1 = "11111111-1111-4111-8111-111111111111";
const PR_2 = "22222222-2222-4222-8222-222222222222";
const PR_3 = "33333333-3333-4333-8333-333333333333";

const PAYLOAD: StaffAlertPayload = {
  alertId: "alert-1",
  reservationRef: "RES-1001",
  passengerOrdinal: 1,
  leg: { origin: "Ollantaytambo", destination: "Machu Picchu Pueblo", departureLocal: "2026-11-02T08:10:00-05:00" },
  returnLegDepartureLocal: "2026-11-04T17:00:00-05:00",
  serviceTier: "PRIME",
  score: 1,
  scaleMax: 5,
  answeredAt: "2026-11-02T08:15:00.000Z",
  passengerLocale: "es",
};

const CREATED_AT = "2026-11-05T00:00:00.000Z";
const DAY_MS = 24 * 60 * 60 * 1000;

export interface StaffAlertStoreHarness {
  /** A store over EMPTY state (the Postgres harness truncates first), with `retention.retentionDays` and a clock reading `now()`. */
  make(now: () => Date, retention: { retentionDays: number }): Promise<StaffAlertStore>;
}

/**
 * Shared conformance suite for every `StaffAlertStore` implementation
 * (in-memory and Postgres): "exactly one staff_alert per pulse response" even
 * under concurrency, the dispatch job's status transitions, the purge scan
 * boundary, and the strict minimal-PII payload shape.
 */
export function describeStaffAlertStoreContract(
  name: string,
  harness: StaffAlertStoreHarness,
  options: { skip?: boolean } = {},
): void {
  describe.skipIf(options.skip === true)(`StaffAlertStore contract: ${name}`, () => {
    let store: StaffAlertStore;
    beforeEach(async () => {
      store = await harness.make(() => new Date(CREATED_AT), { retentionDays: 90 });
    });

    it("creates a record with a generated id, status=pending, attempts=0, createdAt from the clock, purgeAfter from payload.answeredAt (not createdAt) and the payload round-tripped", async () => {
      const record = await store.create({ pulseResponseId: PR_1, payload: PAYLOAD });

      expect(record.id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(record).toEqual({
        id: record.id,
        pulseResponseId: PR_1,
        payload: PAYLOAD,
        status: "pending",
        attempts: 0,
        lastError: null,
        dispatchedAt: null,
        createdAt: CREATED_AT,
        purgeAfter: "2027-01-31T08:15:00.000Z",
      });
    });

    it("round-trips a payload whose returnLegDepartureLocal is null", async () => {
      const payload = { ...PAYLOAD, returnLegDepartureLocal: null };

      await store.create({ pulseResponseId: PR_1, payload });

      expect((await store.findByPulseResponseId(PR_1))?.payload).toEqual(payload);
    });

    it("finds a record by its pulseResponseId, and returns null otherwise", async () => {
      const created = await store.create({ pulseResponseId: PR_1, payload: PAYLOAD });

      expect(await store.findByPulseResponseId(PR_1)).toEqual(created);
      expect(await store.findByPulseResponseId(PR_2)).toBeNull();
      expect(await store.findByPulseResponseId("does-not-exist")).toBeNull();
    });

    it("REJECTS a second create() for the same pulseResponseId and leaves the first row untouched (exactly one staff_alert per passenger/leg)", async () => {
      const first = await store.create({ pulseResponseId: PR_1, payload: PAYLOAD });

      await expect(store.create({ pulseResponseId: PR_1, payload: { ...PAYLOAD, score: 2 } })).rejects.toThrow(
        DuplicateStaffAlertError,
      );

      expect(await store.findByPulseResponseId(PR_1)).toEqual(first);
    });

    it("reports the offending pulseResponseId on the duplicate error", async () => {
      await store.create({ pulseResponseId: PR_1, payload: PAYLOAD });

      await expect(store.create({ pulseResponseId: PR_1, payload: PAYLOAD })).rejects.toMatchObject({
        name: "DuplicateStaffAlertError",
        pulseResponseId: PR_1,
      });
    });

    it("lets exactly one of several concurrent creates for the same pulseResponseId win, the rest being DuplicateStaffAlertError", async () => {
      const results = await Promise.allSettled(
        Array.from({ length: 8 }, () => store.create({ pulseResponseId: PR_1, payload: PAYLOAD })),
      );

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      for (const result of results) {
        if (result.status === "rejected") expect(result.reason).toBeInstanceOf(DuplicateStaffAlertError);
      }
      expect(await store.listPending()).toHaveLength(1);
    });

    it("REJECTS a payload carrying any field outside the strict minimal-PII shape and stores nothing", async () => {
      const withPii = { ...PAYLOAD, passengerName: "Ada Lovelace" } as unknown as StaffAlertPayload;

      await expect(store.create({ pulseResponseId: PR_1, payload: withPii })).rejects.toThrow();

      expect(await store.findByPulseResponseId(PR_1)).toBeNull();
      expect(await store.listPending()).toEqual([]);
    });

    it("listPending() returns only status=pending rows, in insertion order", async () => {
      const first = await store.create({ pulseResponseId: PR_1, payload: PAYLOAD });
      const sent = await store.create({ pulseResponseId: PR_2, payload: PAYLOAD });
      const third = await store.create({ pulseResponseId: PR_3, payload: PAYLOAD });
      await store.updateStatus(sent.id, "sent", { dispatchedAt: "2026-11-02T09:00:00.000Z" });

      expect((await store.listPending()).map((r) => r.id)).toEqual([first.id, third.id]);
    });

    it("updateStatus sets status/attempts/lastError/dispatchedAt on the targeted record only", async () => {
      const target = await store.create({ pulseResponseId: PR_1, payload: PAYLOAD });
      const other = await store.create({ pulseResponseId: PR_2, payload: PAYLOAD });

      await store.updateStatus(target.id, "failed", { attempts: 1, lastError: "network timeout" });

      expect(await store.findByPulseResponseId(PR_1)).toEqual({
        ...target,
        status: "failed",
        attempts: 1,
        lastError: "network timeout",
      });
      expect(await store.findByPulseResponseId(PR_2)).toEqual(other);
    });

    it("updateStatus changes only the given detail fields and an explicit null clears lastError", async () => {
      const target = await store.create({ pulseResponseId: PR_1, payload: PAYLOAD });
      await store.updateStatus(target.id, "failed", { attempts: 2, lastError: "boom" });

      await store.updateStatus(target.id, "sent", { dispatchedAt: "2026-11-02T09:00:00.000Z" });
      expect(await store.findByPulseResponseId(PR_1)).toMatchObject({
        status: "sent",
        attempts: 2,
        lastError: "boom",
        dispatchedAt: "2026-11-02T09:00:00.000Z",
      });

      await store.updateStatus(target.id, "sent", { lastError: null });
      expect(await store.findByPulseResponseId(PR_1)).toMatchObject({ attempts: 2, lastError: null });
    });

    it("supports the terminal dead status and keeps it out of listPending", async () => {
      const target = await store.create({ pulseResponseId: PR_1, payload: PAYLOAD });

      await store.updateStatus(target.id, "dead", { attempts: 4, lastError: "gave up" });

      expect(await store.listPending()).toEqual([]);
      expect(await store.findByPulseResponseId(PR_1)).toMatchObject({ status: "dead", attempts: 4 });
    });

    it("updateStatus on an unknown id is a harmless no-op", async () => {
      const kept = await store.create({ pulseResponseId: PR_1, payload: PAYLOAD });

      await expect(store.updateStatus("does-not-exist", "failed")).resolves.toBeUndefined();
      expect(await store.findByPulseResponseId(PR_1)).toEqual(kept);
    });

    it("listPastPurgeAfter includes a row exactly AT purgeAfter and excludes one a millisecond before it", async () => {
      const due = await store.create({ pulseResponseId: PR_1, payload: PAYLOAD });
      const purgeAtMs = new Date(due.purgeAfter).getTime();

      expect(await store.listPastPurgeAfter(new Date(purgeAtMs))).toEqual([due]);
      expect(await store.listPastPurgeAfter(new Date(purgeAtMs - 1))).toEqual([]);
      expect(await store.listPastPurgeAfter(new Date(purgeAtMs + DAY_MS))).toEqual([due]);
    });

    it("listPastPurgeAfter returns only the due rows when old and fresh alerts coexist, whatever their status", async () => {
      const clocked = await harness.make(() => new Date(CREATED_AT), { retentionDays: 1 });
      const old = await clocked.create({
        pulseResponseId: PR_1,
        payload: { ...PAYLOAD, answeredAt: "2026-01-01T00:00:00.000Z" },
      });
      await clocked.updateStatus(old.id, "sent", { dispatchedAt: "2026-01-01T00:05:00.000Z" });
      await clocked.create({ pulseResponseId: PR_2, payload: { ...PAYLOAD, answeredAt: "2026-11-04T00:00:00.000Z" } });

      const due = await clocked.listPastPurgeAfter(new Date("2026-11-04T12:00:00.000Z"));

      expect(due.map((r) => r.id)).toEqual([old.id]);
    });

    it("deleteById removes only the targeted alert, frees its pulseResponseId, and an unknown id is a no-op", async () => {
      const gone = await store.create({ pulseResponseId: PR_1, payload: PAYLOAD });
      const kept = await store.create({ pulseResponseId: PR_2, payload: PAYLOAD });

      await store.deleteById(gone.id);
      await expect(store.deleteById("does-not-exist")).resolves.toBeUndefined();

      expect(await store.findByPulseResponseId(PR_1)).toBeNull();
      expect(await store.findByPulseResponseId(PR_2)).toEqual(kept);
      await expect(store.create({ pulseResponseId: PR_1, payload: PAYLOAD })).resolves.toMatchObject({ pulseResponseId: PR_1 });
    });
  });
}
