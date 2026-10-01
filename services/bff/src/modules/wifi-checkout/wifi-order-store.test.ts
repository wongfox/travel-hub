import { describe, expect, it } from "vitest";
import { createInMemoryWifiOrderStore } from "./wifi-order-store.js";
import { WifiOrderNotFoundError } from "./errors.js";

const BASE_INPUT = {
  reservationRef: "RES-1001",
  passengerRef: "PAX-1",
  packageId: "WIFI-60",
  amountMinor: 1500,
  currency: "PEN" as const,
  idempotencyKey: "idem-key-1",
};

describe("createInMemoryWifiOrderStore", () => {
  it("creates a new order with status CREATED and null gateway refs", async () => {
    const store = createInMemoryWifiOrderStore(() => new Date("2026-01-01T00:00:00.000Z"));

    const order = await store.create(BASE_INPUT);

    expect(order.status).toBe("CREATED");
    expect(order.gatewaySessionRef).toBeNull();
    expect(order.gatewayPaymentRef).toBeNull();
    expect(order.reservationRef).toBe("RES-1001");
    expect(order.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("create() is idempotent: a second create() call with the same idempotencyKey returns the existing order, not a new one", async () => {
    const store = createInMemoryWifiOrderStore();

    const first = await store.create(BASE_INPUT);
    const second = await store.create({ ...BASE_INPUT, passengerRef: "PAX-DIFFERENT" });

    expect(second.id).toBe(first.id);
    expect(second.passengerRef).toBe("PAX-1"); // unchanged — the original row, not a new one
  });

  it("findByIdempotencyKey resolves the created order; returns null for an unknown key", async () => {
    const store = createInMemoryWifiOrderStore();
    const created = await store.create(BASE_INPUT);

    const found = await store.findByIdempotencyKey(BASE_INPUT.idempotencyKey);
    const missing = await store.findByIdempotencyKey("unknown-key");

    expect(found?.id).toBe(created.id);
    expect(missing).toBeNull();
  });

  it("findById resolves the created order; returns null for an unknown id", async () => {
    const store = createInMemoryWifiOrderStore();
    const created = await store.create(BASE_INPUT);

    expect((await store.findById(created.id))?.id).toBe(created.id);
    expect(await store.findById("unknown-id")).toBeNull();
  });

  it("transition updates status, applies the patch, and appends exactly one wifi_order_event row", async () => {
    const store = createInMemoryWifiOrderStore(() => new Date("2026-01-02T00:00:00.000Z"));
    const created = await store.create(BASE_INPUT);

    const updated = await store.transition(created.id, "PAYMENT_PENDING", { gatewaySessionRef: "session-1" });

    expect(updated.status).toBe("PAYMENT_PENDING");
    expect(updated.gatewaySessionRef).toBe("session-1");
    expect(updated.updatedAt).toBe("2026-01-02T00:00:00.000Z");

    const events = await store.listEventsForOrder(created.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      orderId: created.id,
      fromStatus: "CREATED",
      toStatus: "PAYMENT_PENDING",
    });
  });

  it("transition throws WifiOrderNotFoundError for an unknown order id", async () => {
    const store = createInMemoryWifiOrderStore();

    await expect(store.transition("unknown-id", "PAID", {})).rejects.toBeInstanceOf(WifiOrderNotFoundError);
  });

  it("a second transition appends a second event without losing the first", async () => {
    const store = createInMemoryWifiOrderStore();
    const created = await store.create(BASE_INPUT);
    await store.transition(created.id, "PAYMENT_PENDING", { gatewaySessionRef: "session-1" });

    const final = await store.transition(created.id, "PAID", { gatewayPaymentRef: "payment-1" });

    expect(final.status).toBe("PAID");
    const events = await store.listEventsForOrder(created.id);
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ fromStatus: "PAYMENT_PENDING", toStatus: "PAID" });
  });
});
