import { describe, expect, it } from "vitest";
import { createInMemoryPushSubscriptionStore } from "./push-subscription-store.js";

const INPUT = {
  linkId: "link-1",
  reservationRef: "RES-1001",
  passengerScope: [] as string[],
  endpoint: "https://push.example.com/endpoint-1",
  p256dh: "p256dh-1",
  auth: "auth-1",
  locale: "es" as const,
  consentRecordId: "consent-1",
  expiresAt: "2026-11-05T00:00:00.000Z",
};

describe("createInMemoryPushSubscriptionStore", () => {
  it("creates a record with a generated id and createdAt", async () => {
    const store = createInMemoryPushSubscriptionStore();

    const record = await store.create(INPUT);

    expect(record.id).toBeTruthy();
    expect(record.linkId).toBe("link-1");
    expect(record.reservationRef).toBe("RES-1001");
    expect(record.endpoint).toBe(INPUT.endpoint);
    expect(record.expiresAt).toBe(INPUT.expiresAt);
    expect(typeof record.createdAt).toBe("string");
  });

  it("finds a previously created record by id", async () => {
    const store = createInMemoryPushSubscriptionStore();
    const created = await store.create(INPUT);

    expect(await store.findById(created.id)).toEqual(created);
  });

  it("returns null when no record matches the given id", async () => {
    const store = createInMemoryPushSubscriptionStore();

    expect(await store.findById("does-not-exist")).toBeNull();
  });

  it("finds every subscription bound to one reservation", async () => {
    const store = createInMemoryPushSubscriptionStore();
    await store.create(INPUT);
    await store.create({ ...INPUT, endpoint: "https://push.example.com/endpoint-2" });
    await store.create({ ...INPUT, reservationRef: "RES-2002", endpoint: "https://push.example.com/endpoint-3" });

    const found = await store.findActiveByReservation("RES-1001");

    expect(found).toHaveLength(2);
    expect(found.every((record) => record.reservationRef === "RES-1001")).toBe(true);
  });

  it("returns an empty array for a reservation with no subscriptions", async () => {
    const store = createInMemoryPushSubscriptionStore();

    expect(await store.findActiveByReservation("RES-UNKNOWN")).toEqual([]);
  });

  it("deleteById removes only the targeted record", async () => {
    const store = createInMemoryPushSubscriptionStore();
    const target = await store.create(INPUT);
    const other = await store.create({ ...INPUT, endpoint: "https://push.example.com/endpoint-2" });

    await store.deleteById(target.id);

    expect(await store.findById(target.id)).toBeNull();
    expect(await store.findById(other.id)).toEqual(other);
  });

  it("deleteById on an unknown id is a harmless no-op", async () => {
    const store = createInMemoryPushSubscriptionStore();

    await expect(store.deleteById("does-not-exist")).resolves.toBeUndefined();
  });

  it("deleteByLinkId removes every subscription bound to that link, leaving other links untouched", async () => {
    const store = createInMemoryPushSubscriptionStore();
    const subA = await store.create({ ...INPUT, linkId: "link-a", endpoint: "https://push.example.com/endpoint-a" });
    const subB = await store.create({ ...INPUT, linkId: "link-a", endpoint: "https://push.example.com/endpoint-b" });
    const subOther = await store.create({ ...INPUT, linkId: "link-b", endpoint: "https://push.example.com/endpoint-c" });

    await store.deleteByLinkId("link-a");

    expect(await store.findById(subA.id)).toBeNull();
    expect(await store.findById(subB.id)).toBeNull();
    expect(await store.findById(subOther.id)).toEqual(subOther);
  });

  it("deleteByLinkId on a link with no subscriptions is a harmless no-op", async () => {
    const store = createInMemoryPushSubscriptionStore();

    await expect(store.deleteByLinkId("no-such-link")).resolves.toBeUndefined();
  });
});
