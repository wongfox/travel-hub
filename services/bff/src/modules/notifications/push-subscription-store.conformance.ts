import { beforeEach, describe, expect, it } from "vitest";
import type { CreatePushSubscriptionInput, PushSubscriptionStore } from "./ports.js";

const LINK_1 = "11111111-1111-4111-8111-111111111111";
const LINK_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LINK_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CONSENT_1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const INPUT: CreatePushSubscriptionInput = {
  linkId: LINK_1,
  reservationRef: "RES-1001",
  passengerScope: [],
  endpoint: "https://push.example.com/endpoint-1",
  p256dh: "p256dh-1",
  auth: "auth-1",
  locale: "es",
  consentRecordId: CONSENT_1,
  expiresAt: "2026-11-05T00:00:00.000Z",
};

const NOW = new Date("2026-10-01T12:00:00.000Z");

export interface PushSubscriptionStoreHarness {
  /** A store whose clock reads `now()`, over EMPTY state (the Postgres harness truncates first). */
  make(now?: () => Date): Promise<PushSubscriptionStore>;
}

/**
 * Shared conformance suite for every `PushSubscriptionStore` implementation
 * (in-memory and Postgres): lookup, active-vs-expired by the clock, and the
 * three deletion scopes (id / link / reservation) the reissue, withdrawal and
 * purge flows rely on.
 */
export function describePushSubscriptionStoreContract(
  name: string,
  harness: PushSubscriptionStoreHarness,
  options: { skip?: boolean } = {},
): void {
  describe.skipIf(options.skip === true)(`PushSubscriptionStore contract: ${name}`, () => {
    let store: PushSubscriptionStore;
    beforeEach(async () => {
      store = await harness.make(() => NOW);
    });

    it("creates a record with a generated id, createdAt from the clock, and every field round-tripped", async () => {
      const record = await store.create({ ...INPUT, passengerScope: ["PAX-1", "PAX-2"], locale: "en" });

      expect(record.id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(record).toEqual({
        ...INPUT,
        passengerScope: ["PAX-1", "PAX-2"],
        locale: "en",
        id: record.id,
        createdAt: "2026-10-01T12:00:00.000Z",
      });
    });

    it("finds a previously created record by id", async () => {
      const created = await store.create(INPUT);

      expect(await store.findById(created.id)).toEqual(created);
    });

    it("returns null when no record matches the given id", async () => {
      expect(await store.findById("does-not-exist")).toBeNull();
    });

    it("finds every subscription bound to one reservation, in creation order", async () => {
      const first = await store.create(INPUT);
      await store.create({ ...INPUT, reservationRef: "RES-2002", endpoint: "https://push.example.com/endpoint-3" });
      const second = await store.create({ ...INPUT, endpoint: "https://push.example.com/endpoint-2" });

      const found = await store.findActiveByReservation("RES-1001");

      expect(found.map((record) => record.id)).toEqual([first.id, second.id]);
    });

    it("excludes a subscription whose expiresAt has already passed (R3-002), including one expiring exactly now", async () => {
      await store.create(INPUT); // 2026-11-05 is in the future of NOW: active
      const past = await store.create({ ...INPUT, endpoint: "https://push.example.com/past", expiresAt: "2026-09-30T00:00:00.000Z" });
      const boundary = await store.create({ ...INPUT, endpoint: "https://push.example.com/boundary", expiresAt: NOW.toISOString() });

      const found = await store.findActiveByReservation("RES-1001");

      expect(found.map((record) => record.endpoint)).toEqual([INPUT.endpoint]);
      expect(found.some((record) => record.id === past.id || record.id === boundary.id)).toBe(false);
    });

    it("returns an empty array for a reservation with no subscriptions", async () => {
      expect(await store.findActiveByReservation("RES-UNKNOWN")).toEqual([]);
    });

    it("deleteById removes only the targeted record", async () => {
      const target = await store.create(INPUT);
      const other = await store.create({ ...INPUT, endpoint: "https://push.example.com/endpoint-2" });

      await store.deleteById(target.id);

      expect(await store.findById(target.id)).toBeNull();
      expect(await store.findById(other.id)).toEqual(other);
    });

    it("deleteById on an unknown id is a harmless no-op", async () => {
      const kept = await store.create(INPUT);

      await expect(store.deleteById("does-not-exist")).resolves.toBeUndefined();
      expect(await store.findById(kept.id)).toEqual(kept);
    });

    it("deleteByLinkId removes every subscription bound to that link, leaving other links untouched", async () => {
      const subA = await store.create({ ...INPUT, linkId: LINK_A, endpoint: "https://push.example.com/endpoint-a" });
      const subB = await store.create({ ...INPUT, linkId: LINK_A, endpoint: "https://push.example.com/endpoint-b" });
      const subOther = await store.create({ ...INPUT, linkId: LINK_B, endpoint: "https://push.example.com/endpoint-c" });

      await store.deleteByLinkId(LINK_A);

      expect(await store.findById(subA.id)).toBeNull();
      expect(await store.findById(subB.id)).toBeNull();
      expect(await store.findById(subOther.id)).toEqual(subOther);
    });

    it("deleteByLinkId on a link with no subscriptions is a harmless no-op", async () => {
      await expect(store.deleteByLinkId("no-such-link")).resolves.toBeUndefined();
    });

    it("deleteByReservation removes every subscription for that reservation across links, leaving other reservations untouched (task 12.3)", async () => {
      const subA = await store.create({ ...INPUT, linkId: LINK_A, endpoint: "https://push.example.com/endpoint-a" });
      const subB = await store.create({ ...INPUT, linkId: LINK_B, endpoint: "https://push.example.com/endpoint-b" });
      const subOther = await store.create({ ...INPUT, reservationRef: "RES-2002", endpoint: "https://push.example.com/endpoint-c" });

      await store.deleteByReservation("RES-1001");

      expect(await store.findById(subA.id)).toBeNull();
      expect(await store.findById(subB.id)).toBeNull();
      expect(await store.findById(subOther.id)).toEqual(subOther);
    });

    it("deleteByReservation for a reservation with no subscriptions is a harmless no-op", async () => {
      await expect(store.deleteByReservation("RES-UNKNOWN")).resolves.toBeUndefined();
    });

    it("listExpired returns only subscriptions whose expiresAt is at or before the given time, in creation order (task 12.3)", async () => {
      const expired = await store.create(INPUT); // expiresAt: 2026-11-05
      const active = await store.create({ ...INPUT, endpoint: "https://push.example.com/active", expiresAt: "2027-01-01T00:00:00.000Z" });
      const boundary = await store.create({ ...INPUT, endpoint: "https://push.example.com/boundary", expiresAt: "2026-12-01T00:00:00.000Z" });

      const found = await store.listExpired(new Date("2026-12-01T00:00:00.000Z"));

      expect(found.map((record) => record.id)).toEqual([expired.id, boundary.id]);
      expect(found.some((record) => record.id === active.id)).toBe(false);
    });

    it("listExpired is independent of the store clock: it uses the time it is given", async () => {
      const record = await store.create(INPUT);

      expect(await store.listExpired(new Date("2026-10-02T00:00:00.000Z"))).toEqual([]);
      expect((await store.listExpired(new Date("2026-11-05T00:00:00.000Z"))).map((r) => r.id)).toEqual([record.id]);
    });
  });
}
