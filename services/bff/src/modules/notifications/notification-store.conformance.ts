import { beforeEach, describe, expect, it } from "vitest";
import { DuplicateNotificationError, type CreateNotificationInput, type NotificationStore } from "./ports.js";

const INPUT: CreateNotificationInput = {
  reservationRef: "RES-1001",
  alertType: "RELOCATION",
  sourceEventId: "relocation:LEG-1:2026-10-01T00:00:00.000Z",
  channel: "push",
  dedupeKey: "RELOCATION:RES-1001:relocation:LEG-1:2026-10-01T00:00:00.000Z",
  status: "pending",
};

export interface NotificationStoreHarness {
  /** A store whose clock reads `now()`, over EMPTY state (the Postgres harness truncates first). */
  make(now?: () => Date): Promise<NotificationStore>;
}

/**
 * Shared conformance suite for every `NotificationStore` implementation
 * (in-memory and Postgres): the `dedupe_key` uniqueness the journey-poll job
 * relies on (a repeated event never produces a second notification row, even
 * under concurrency) plus status updates.
 */
export function describeNotificationStoreContract(
  name: string,
  harness: NotificationStoreHarness,
  options: { skip?: boolean } = {},
): void {
  describe.skipIf(options.skip === true)(`NotificationStore contract: ${name}`, () => {
    let store: NotificationStore;
    beforeEach(async () => {
      store = await harness.make(() => new Date("2026-10-01T12:00:00.000Z"));
    });

    it("creates a record with a generated id, createdAt from the clock, attempts=0, sentAt=null and every field round-tripped", async () => {
      const record = await store.create(INPUT);

      expect(record.id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(record).toEqual({ ...INPUT, id: record.id, attempts: 0, sentAt: null, createdAt: "2026-10-01T12:00:00.000Z" });
    });

    it("finds a record by its dedupeKey", async () => {
      const created = await store.create(INPUT);

      expect(await store.findByDedupeKey(INPUT.dedupeKey)).toEqual(created);
    });

    it("returns null when no record matches the given dedupeKey", async () => {
      expect(await store.findByDedupeKey("does-not-exist")).toBeNull();
    });

    it("REJECTS a second create() with the same dedupeKey and leaves the first row untouched (task 11.2 acceptance: a duplicate event never produces a second notification row)", async () => {
      const first = await store.create(INPUT);

      await expect(store.create({ ...INPUT, channel: "banner", status: "sent" })).rejects.toThrow(DuplicateNotificationError);

      expect(await store.findByDedupeKey(INPUT.dedupeKey)).toEqual(first);
    });

    it("reports the offending dedupeKey on the duplicate error", async () => {
      await store.create(INPUT);

      await expect(store.create(INPUT)).rejects.toMatchObject({ name: "DuplicateNotificationError", dedupeKey: INPUT.dedupeKey });
    });

    it("lets exactly one of several concurrent creates for the same dedupeKey win, the rest being DuplicateNotificationError", async () => {
      const results = await Promise.allSettled(Array.from({ length: 8 }, () => store.create(INPUT)));

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      for (const result of results) {
        if (result.status === "rejected") expect(result.reason).toBeInstanceOf(DuplicateNotificationError);
      }
    });

    it("allows two different dedupeKeys to coexist", async () => {
      await store.create(INPUT);

      await expect(store.create({ ...INPUT, dedupeKey: "a-different-key" })).resolves.toMatchObject({ dedupeKey: "a-different-key" });
    });

    it("updateStatus updates status and sentAt and counts the attempt, on the targeted record only", async () => {
      const target = await store.create(INPUT);
      const other = await store.create({ ...INPUT, dedupeKey: "other-key" });

      await store.updateStatus(target.id, "sent", "2026-10-01T01:00:00.000Z");

      expect(await store.findByDedupeKey(INPUT.dedupeKey)).toEqual({
        ...target,
        status: "sent",
        attempts: 1,
        sentAt: "2026-10-01T01:00:00.000Z",
      });
      expect(await store.findByDedupeKey("other-key")).toEqual(other);
    });

    it("updateStatus without sentAt keeps the previous sentAt and increments attempts on every call", async () => {
      const target = await store.create(INPUT);
      await store.updateStatus(target.id, "sent", "2026-10-01T01:00:00.000Z");

      await store.updateStatus(target.id, "failed");

      expect(await store.findByDedupeKey(INPUT.dedupeKey)).toMatchObject({
        status: "failed",
        attempts: 2,
        sentAt: "2026-10-01T01:00:00.000Z",
      });
    });

    it("updateStatus on an unknown id is a harmless no-op", async () => {
      const kept = await store.create(INPUT);

      await expect(store.updateStatus("does-not-exist", "failed")).resolves.toBeUndefined();
      expect(await store.findByDedupeKey(INPUT.dedupeKey)).toEqual(kept);
    });
  });
}
