import { describe, expect, it } from "vitest";
import { createInMemoryAnalyticsEventStore } from "./analytics-event-store.js";

describe("createInMemoryAnalyticsEventStore", () => {
  it("creates a record whose shape never includes a reservationRef/passengerRef field at all", async () => {
    const store = createInMemoryAnalyticsEventStore(() => new Date("2026-10-01T00:00:00.000Z"));

    const record = await store.create({
      name: "screen_view",
      tripHash: "a".repeat(64),
      occurredAt: "2026-10-01T00:00:00.000Z",
    });

    expect("reservationRef" in record).toBe(false);
    expect("passengerRef" in record).toBe(false);
    expect(record.tripHash).toBe("a".repeat(64));
    expect(record.forwardedAt).toBeNull();
  });

  it("listPendingForward returns only rows not yet forwarded, and markForwarded moves them out", async () => {
    const store = createInMemoryAnalyticsEventStore();
    const a = await store.create({ name: "screen_view", tripHash: "a".repeat(64), occurredAt: "2026-10-01T00:00:00.000Z" });
    const b = await store.create({ name: "tfe_click_out", tripHash: "b".repeat(64), occurredAt: "2026-10-01T00:00:01.000Z" });

    expect((await store.listPendingForward()).map((r) => r.id)).toEqual([a.id, b.id]);

    await store.markForwarded([a.id], "2026-10-01T01:00:00.000Z");

    const pending = await store.listPendingForward();
    expect(pending.map((r) => r.id)).toEqual([b.id]);
    const all = await store.list();
    expect(all.find((r) => r.id === a.id)?.forwardedAt).toBe("2026-10-01T01:00:00.000Z");
  });

  it("list() returns every recorded event in insertion order", async () => {
    const store = createInMemoryAnalyticsEventStore();
    await store.create({ name: "wifi_offer_viewed", tripHash: "a".repeat(64), occurredAt: "2026-10-01T00:00:00.000Z" });
    await store.create({ name: "wifi_package_selected", tripHash: "a".repeat(64), occurredAt: "2026-10-01T00:00:01.000Z" });

    const all = await store.list();
    expect(all.map((r) => r.name)).toEqual(["wifi_offer_viewed", "wifi_package_selected"]);
  });

  it("deletePendingByTripHash removes only the not-yet-forwarded rows of that trip and reports the count", async () => {
    const store = createInMemoryAnalyticsEventStore();
    const forwarded = await store.create({ name: "screen_view", tripHash: "a".repeat(64), occurredAt: "2026-10-01T00:00:00.000Z" });
    await store.markForwarded([forwarded.id], "2026-10-01T01:00:00.000Z");
    await store.create({ name: "screen_view", tripHash: "a".repeat(64), occurredAt: "2026-10-01T00:00:01.000Z" });
    const other = await store.create({ name: "screen_view", tripHash: "b".repeat(64), occurredAt: "2026-10-01T00:00:02.000Z" });

    const deleted = await store.deletePendingByTripHash("a".repeat(64));

    expect(deleted).toBe(1);
    const remaining = await store.list();
    expect(remaining.map((r) => r.id).sort()).toEqual([forwarded.id, other.id].sort());
  });
});
