import { beforeEach, describe, expect, it } from "vitest";
import { DuplicatePulseResponseError, type CreatePulseResponseInput, type PulseResponseStore } from "./ports.js";

const INPUT: CreatePulseResponseInput = {
  reservationRef: "RES-1001",
  passengerRef: "P1",
  legRef: "L1",
  score: 2,
  locale: "es",
};

const T0 = "2026-11-02T08:15:00.000Z";
const DAY_MS = 24 * 60 * 60 * 1000;

export interface PulseResponseStoreHarness {
  /** A store over EMPTY state (the Postgres harness truncates first), with `retention.retentionDays` and a clock reading `now()`. */
  make(now: () => Date, retention: { retentionDays: number }): Promise<PulseResponseStore>;
}

/**
 * Shared conformance suite for every `PulseResponseStore` implementation
 * (in-memory and Postgres): one response per passenger/leg (even under
 * concurrency), `purgeAfter = answeredAt + retentionDays`, and the purge
 * scan boundary (`purgeAfter <= asOf`).
 */
export function describePulseResponseStoreContract(
  name: string,
  harness: PulseResponseStoreHarness,
  options: { skip?: boolean } = {},
): void {
  describe.skipIf(options.skip === true)(`PulseResponseStore contract: ${name}`, () => {
    let store: PulseResponseStore;
    beforeEach(async () => {
      store = await harness.make(() => new Date(T0), { retentionDays: 90 });
    });

    it("creates a record with a generated id, answeredAt from the clock, purgeAfter = answeredAt + retentionDays and every field round-tripped", async () => {
      const record = await store.create(INPUT);

      expect(record.id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(record).toEqual({ ...INPUT, id: record.id, answeredAt: T0, purgeAfter: "2027-01-31T08:15:00.000Z" });
    });

    it("finds a record by its composite key", async () => {
      const created = await store.create(INPUT);

      expect(await store.findByComposite("RES-1001", "P1", "L1")).toEqual(created);
    });

    it("returns null when no record matches the composite key", async () => {
      expect(await store.findByComposite("RES-1001", "P1", "L1")).toBeNull();
      await store.create(INPUT);
      expect(await store.findByComposite("RES-1001", "P2", "L1")).toBeNull();
      expect(await store.findByComposite("RES-1001", "P1", "L2")).toBeNull();
    });

    it("REJECTS a second create() for the same (reservationRef, passengerRef, legRef) and leaves the first row untouched (spec: a second submission is rejected, not double-recorded)", async () => {
      const first = await store.create(INPUT);

      await expect(store.create({ ...INPUT, score: 5 })).rejects.toThrow(DuplicatePulseResponseError);

      expect(await store.findByComposite("RES-1001", "P1", "L1")).toEqual(first);
      expect(await store.list()).toHaveLength(1);
    });

    it("reports the offending composite key on the duplicate error", async () => {
      await store.create(INPUT);

      await expect(store.create(INPUT)).rejects.toMatchObject({
        name: "DuplicatePulseResponseError",
        reservationRef: "RES-1001",
        passengerRef: "P1",
        legRef: "L1",
      });
    });

    it("lets exactly one of several concurrent creates for the same passenger/leg win, the rest being DuplicatePulseResponseError", async () => {
      const results = await Promise.allSettled(Array.from({ length: 8 }, () => store.create(INPUT)));

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      for (const result of results) {
        if (result.status === "rejected") expect(result.reason).toBeInstanceOf(DuplicatePulseResponseError);
      }
      expect(await store.list()).toHaveLength(1);
    });

    it("allows a different passenger, leg or reservation to answer independently", async () => {
      await store.create(INPUT);

      await expect(store.create({ ...INPUT, passengerRef: "P2" })).resolves.toMatchObject({ passengerRef: "P2" });
      await expect(store.create({ ...INPUT, legRef: "L2" })).resolves.toMatchObject({ legRef: "L2" });
      await expect(store.create({ ...INPUT, reservationRef: "RES-2" })).resolves.toMatchObject({ reservationRef: "RES-2" });
    });

    it("list() returns every recorded response in insertion order", async () => {
      await store.create(INPUT);
      await store.create({ ...INPUT, passengerRef: "P2" });
      await store.create({ ...INPUT, passengerRef: "P3" });

      expect((await store.list()).map((r) => r.passengerRef)).toEqual(["P1", "P2", "P3"]);
    });

    it("listPastPurgeAfter includes a row exactly AT purgeAfter and excludes one a millisecond before it", async () => {
      const due = await store.create(INPUT);
      const purgeAtMs = new Date(due.purgeAfter).getTime();

      expect(await store.listPastPurgeAfter(new Date(purgeAtMs))).toEqual([due]);
      expect(await store.listPastPurgeAfter(new Date(purgeAtMs - 1))).toEqual([]);
      expect(await store.listPastPurgeAfter(new Date(purgeAtMs + DAY_MS))).toEqual([due]);
    });

    it("listPastPurgeAfter returns only the due rows when old and fresh responses coexist", async () => {
      let nowMs = new Date(T0).getTime();
      const clocked = await harness.make(() => new Date(nowMs), { retentionDays: 1 });
      const old = await clocked.create(INPUT);
      nowMs += 2 * DAY_MS;
      await clocked.create({ ...INPUT, passengerRef: "P2" });

      expect(await clocked.listPastPurgeAfter(new Date(nowMs))).toEqual([old]);
    });

    it("deleteById removes only the targeted response, and an unknown id is a harmless no-op", async () => {
      const gone = await store.create(INPUT);
      const kept = await store.create({ ...INPUT, passengerRef: "P2" });

      await store.deleteById(gone.id);
      await expect(store.deleteById("does-not-exist")).resolves.toBeUndefined();

      expect(await store.list()).toEqual([kept]);
      expect(await store.findByComposite("RES-1001", "P1", "L1")).toBeNull();
    });

    it("allows the passenger/leg to answer again after its response was purged", async () => {
      const gone = await store.create(INPUT);
      await store.deleteById(gone.id);

      await expect(store.create(INPUT)).resolves.toMatchObject({ passengerRef: "P1" });
    });
  });
}
