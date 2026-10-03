import { beforeEach, describe, expect, it } from "vitest";
import type { AnalyticsEventStore, CreateAnalyticsEventInput } from "./ports.js";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function event(tripHash: string, n: number, extra: Partial<CreateAnalyticsEventInput> = {}): CreateAnalyticsEventInput {
  return {
    name: "screen_view",
    tripHash,
    occurredAt: new Date(Date.UTC(2026, 9, 1, 0, 0, n)).toISOString(),
    ...extra,
  };
}

export interface AnalyticsEventStoreHarness {
  /** A store whose clock reads `now()`, over EMPTY state (the Postgres harness truncates first). */
  make(now?: () => Date): Promise<AnalyticsEventStore>;
}

/**
 * Shared conformance suite for every `AnalyticsEventStore` implementation
 * (in-memory and Postgres): all-or-nothing `createMany`, pending listing,
 * `markForwarded`, and the withdrawal cascade's `deletePendingByTripHash`.
 */
export function describeAnalyticsEventStoreContract(
  name: string,
  harness: AnalyticsEventStoreHarness,
  options: { skip?: boolean } = {},
): void {
  describe.skipIf(options.skip === true)(`AnalyticsEventStore contract: ${name}`, () => {
    let store: AnalyticsEventStore;
    beforeEach(async () => {
      store = await harness.make(() => new Date("2026-10-01T12:00:00.000Z"));
    });

    it("creates a pseudonymous record: no reservation reference, createdAt from the clock, not forwarded", async () => {
      const record = await store.create(event(HASH_A, 0, { props: { screen: "home", n: 2, nested: { ok: true } } }));

      expect(record).toMatchObject({
        name: "screen_view",
        tripHash: HASH_A,
        occurredAt: "2026-10-01T00:00:00.000Z",
        props: { screen: "home", n: 2, nested: { ok: true } },
        createdAt: "2026-10-01T12:00:00.000Z",
        forwardedAt: null,
      });
      expect(record.id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(Object.keys(record).sort()).toEqual(
        ["createdAt", "forwardedAt", "id", "name", "occurredAt", "props", "tripHash"].sort(),
      );
    });

    it("omits props entirely when none were given", async () => {
      const record = await store.create(event(HASH_A, 0));
      expect("props" in record).toBe(false);
      expect("props" in (await store.list())[0]!).toBe(false);
    });

    it("list() and listPendingForward() return insertion order", async () => {
      const first = await store.create(event(HASH_A, 0));
      const second = await store.create(event(HASH_B, 1));
      const [third, fourth] = await store.createMany([event(HASH_A, 2), event(HASH_A, 3)]);

      const ids = [first.id, second.id, third!.id, fourth!.id];
      expect((await store.list()).map((r) => r.id)).toEqual(ids);
      expect((await store.listPendingForward()).map((r) => r.id)).toEqual(ids);
    });

    it("createMany returns the created rows in input order and persists them", async () => {
      const created = await store.createMany([event(HASH_A, 0, { props: { n: 1 } }), event(HASH_A, 1, { props: { n: 2 } })]);

      expect(created.map((r) => r.props?.n)).toEqual([1, 2]);
      expect((await store.list()).map((r) => r.id)).toEqual(created.map((r) => r.id));
      expect(await store.createMany([])).toEqual([]);
    });

    it("createMany is all-or-nothing: a batch with an invalid row persists nothing", async () => {
      await store.create(event(HASH_B, 0));

      await expect(
        store.createMany([event(HASH_A, 1), event(HASH_A, 2, { occurredAt: "not-a-date" }), event(HASH_A, 3)]),
      ).rejects.toThrow();

      const all = await store.list();
      expect(all).toHaveLength(1);
      expect(all[0]?.tripHash).toBe(HASH_B);
    });

    it("concurrent createMany batches all persist without losing or duplicating rows", async () => {
      const batches = await Promise.all(
        Array.from({ length: 6 }, (_, b) => store.createMany([0, 1, 2, 3].map((n) => event(HASH_A, b * 10 + n, { props: { b, n } })))),
      );

      const all = await store.list();
      expect(all).toHaveLength(24);
      expect(new Set(all.map((r) => r.id)).size).toBe(24);
      for (const [b, batch] of batches.entries()) {
        expect(batch.map((r) => r.props?.n)).toEqual([0, 1, 2, 3]);
        expect(batch.every((r) => r.props?.b === b)).toBe(true);
      }
    });

    it("markForwarded removes rows from the pending list, stamps forwardedAt and keeps them in list()", async () => {
      const a = await store.create(event(HASH_A, 0));
      const b = await store.create(event(HASH_B, 1));

      await store.markForwarded([a.id], "2026-10-01T13:00:00.000Z");

      expect((await store.listPendingForward()).map((r) => r.id)).toEqual([b.id]);
      expect((await store.list()).find((r) => r.id === a.id)?.forwardedAt).toBe("2026-10-01T13:00:00.000Z");
      // Forwarded rows are never listed again, even after further activity.
      await store.create(event(HASH_A, 2));
      expect((await store.listPendingForward()).map((r) => r.id)).not.toContain(a.id);
    });

    it("markForwarded tolerates an empty list and unknown ids", async () => {
      const a = await store.create(event(HASH_A, 0));

      await store.markForwarded([], "2026-10-01T13:00:00.000Z");
      await store.markForwarded(["00000000-0000-4000-8000-000000000000"], "2026-10-01T13:00:00.000Z");

      expect((await store.listPendingForward()).map((r) => r.id)).toEqual([a.id]);
    });

    it("deletePendingByTripHash removes only the pending rows of that trip and returns the count", async () => {
      const forwarded = await store.create(event(HASH_A, 0));
      await store.markForwarded([forwarded.id], "2026-10-01T13:00:00.000Z");
      await store.createMany([event(HASH_A, 1), event(HASH_A, 2)]);
      const other = await store.create(event(HASH_B, 3));

      expect(await store.deletePendingByTripHash(HASH_A)).toBe(2);

      expect((await store.list()).map((r) => r.id).sort()).toEqual([forwarded.id, other.id].sort());
      expect(await store.deletePendingByTripHash(HASH_A)).toBe(0);
      expect(await store.deletePendingByTripHash("c".repeat(64))).toBe(0);
    });
  });
}
