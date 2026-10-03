import { beforeEach, describe, expect, it } from "vitest";
import { WifiOrderNotFoundError } from "./errors.js";
import type { WifiOrderStore } from "./ports.js";

const BASE_INPUT = {
  reservationRef: "RES-1001",
  passengerRef: "PAX-1",
  packageId: "WIFI-60",
  amountMinor: 1500,
  currency: "PEN" as const,
  idempotencyKey: "idem-key-1",
};

const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

export interface WifiOrderStoreHarness {
  /** A store whose clock reads `now()`, over EMPTY state (the Postgres harness truncates first). */
  make(now?: () => Date): Promise<WifiOrderStore>;
}

/**
 * Shared conformance suite for every `WifiOrderStore` implementation
 * (in-memory and Postgres): the same behavior, including the atomic
 * compare-and-swap `transition(id, expectedStatus, toStatus, patch)`.
 */
export function describeWifiOrderStoreContract(
  name: string,
  harness: WifiOrderStoreHarness,
  options: { skip?: boolean } = {},
): void {
  describe.skipIf(options.skip === true)(`WifiOrderStore contract: ${name}`, () => {
    let make: WifiOrderStoreHarness["make"];
    beforeEach(() => {
      make = harness.make;
    });

    it("creates a new order with status CREATED, null progress fields and the input fields", async () => {
      const store = await make(() => new Date("2026-01-01T00:00:00.000Z"));
      const order = await store.create({ ...BASE_INPUT, legRef: "LEG-1", buyerEmail: "ana@example.com" });

      expect(order).toMatchObject({
        status: "CREATED",
        reservationRef: "RES-1001",
        passengerRef: "PAX-1",
        packageId: "WIFI-60",
        amountMinor: 1500,
        currency: "PEN",
        idempotencyKey: "idem-key-1",
        legRef: "LEG-1",
        buyerEmail: "ana@example.com",
        gatewaySessionRef: null,
        gatewayPaymentRef: null,
        entitlementRef: null,
        entitlementExpiresAt: null,
        sirRegisteredAt: null,
        sirSaleRef: null,
        sirRegistrationAttempts: 0,
        sirReconciliationRequired: false,
        receiptIssuedAt: null,
        receiptRef: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
      expect(order.id).toBeTruthy();
    });

    it("defaults legRef and buyerEmail to empty strings", async () => {
      const store = await make();
      const order = await store.create(BASE_INPUT);
      expect(order.legRef).toBe("");
      expect(order.buyerEmail).toBe("");
    });

    it("create() is idempotent per idempotencyKey and returns the original row", async () => {
      const store = await make();
      const first = await store.create(BASE_INPUT);
      const second = await store.create({ ...BASE_INPUT, passengerRef: "PAX-DIFFERENT" });

      expect(second.id).toBe(first.id);
      expect(second.passengerRef).toBe("PAX-1");
    });

    it("concurrent create() calls with one idempotencyKey yield a single order", async () => {
      const store = await make();
      const results = await Promise.all(Array.from({ length: 5 }, () => store.create(BASE_INPUT)));

      expect(new Set(results.map((o) => o.id)).size).toBe(1);
      expect(await store.listByStatus("CREATED")).toHaveLength(1);
    });

    it("findByIdempotencyKey and findById resolve a created order and return null when unknown", async () => {
      const store = await make();
      const created = await store.create(BASE_INPUT);

      expect((await store.findByIdempotencyKey(BASE_INPUT.idempotencyKey))?.id).toBe(created.id);
      expect(await store.findByIdempotencyKey("unknown-key")).toBeNull();
      expect((await store.findById(created.id))?.id).toBe(created.id);
      expect(await store.findById(UNKNOWN_ID)).toBeNull();
      expect(await store.findById("not-a-uuid")).toBeNull();
    });

    it("transition applies the patch, bumps updatedAt and appends exactly one event", async () => {
      let clock = new Date("2026-01-01T00:00:00.000Z");
      const store = await make(() => clock);
      const created = await store.create(BASE_INPUT);
      clock = new Date("2026-01-02T00:00:00.000Z");

      const updated = await store.transition(created.id, "CREATED", "PAYMENT_PENDING", {
        gatewaySessionRef: "session-1",
      });

      expect(updated).toMatchObject({
        status: "PAYMENT_PENDING",
        gatewaySessionRef: "session-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      });
      expect((await store.findById(created.id))?.status).toBe("PAYMENT_PENDING");
      const events = await store.listEventsForOrder(created.id);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        orderId: created.id,
        fromStatus: "CREATED",
        toStatus: "PAYMENT_PENDING",
        detail: { gatewaySessionRef: "session-1" },
        at: "2026-01-02T00:00:00.000Z",
      });
    });

    it("transition throws WifiOrderNotFoundError for an unknown order id", async () => {
      const store = await make();
      await expect(store.transition(UNKNOWN_ID, "CREATED", "PAID", {})).rejects.toBeInstanceOf(
        WifiOrderNotFoundError,
      );
      await expect(store.transition("not-a-uuid", "CREATED", "PAID", {})).rejects.toBeInstanceOf(
        WifiOrderNotFoundError,
      );
    });

    it("transition is a compare-and-swap: a stale expectedStatus returns null and writes nothing", async () => {
      const store = await make();
      const created = await store.create(BASE_INPUT);
      await store.transition(created.id, "CREATED", "PAYMENT_PENDING", {});
      await store.transition(created.id, "PAYMENT_PENDING", "PAID", { gatewayPaymentRef: "pay-1" });

      const missed = await store.transition(created.id, "PAYMENT_PENDING", "PAYMENT_FAILED", {
        gatewayPaymentRef: "pay-2",
      });

      expect(missed).toBeNull();
      const current = await store.findById(created.id);
      expect(current?.status).toBe("PAID");
      expect(current?.gatewayPaymentRef).toBe("pay-1");
      expect(await store.listEventsForOrder(created.id)).toHaveLength(2);
    });

    it("a stale same-status progress write cannot undo a REFUND_PENDING/REFUNDED transition", async () => {
      const store = await make();
      const created = await store.create(BASE_INPUT);
      await store.transition(created.id, "CREATED", "ENTITLEMENT_ACTIVE", { entitlementRef: "ENT-1" });
      await store.transition(created.id, "ENTITLEMENT_ACTIVE", "REFUND_PENDING", {});

      // A job read the order while ENTITLEMENT_ACTIVE and now writes progress.
      const stale = await store.transition(created.id, "ENTITLEMENT_ACTIVE", "ENTITLEMENT_ACTIVE", {
        receiptIssuedAt: "2026-01-02T00:00:00.000Z",
        receiptRef: "R-1",
      });

      expect(stale).toBeNull();
      const current = await store.findById(created.id);
      expect(current?.status).toBe("REFUND_PENDING");
      expect(current?.receiptRef).toBeNull();
    });

    it("of concurrent transitions from the same expectedStatus exactly one wins", async () => {
      const store = await make();
      const created = await store.create(BASE_INPUT);
      await store.transition(created.id, "CREATED", "PAYMENT_PENDING", {});

      const results = await Promise.all([
        store.transition(created.id, "PAYMENT_PENDING", "PAID", { gatewayPaymentRef: "a" }),
        store.transition(created.id, "PAYMENT_PENDING", "PAYMENT_FAILED", { gatewayPaymentRef: "b" }),
        store.transition(created.id, "PAYMENT_PENDING", "PAID", { gatewayPaymentRef: "c" }),
      ]);

      expect(results.filter((r) => r !== null)).toHaveLength(1);
      const events = await store.listEventsForOrder(created.id);
      expect(events).toHaveLength(2); // PENDING + the single winner
      const final = await store.findById(created.id);
      expect(final?.status).toBe(events[1]?.toStatus);
    });

    it("events are returned in transition order", async () => {
      const store = await make();
      const created = await store.create(BASE_INPUT);
      await store.transition(created.id, "CREATED", "PAYMENT_PENDING", {});
      await store.transition(created.id, "PAYMENT_PENDING", "PAID", {});
      await store.transition(created.id, "PAID", "ENTITLEMENT_ACTIVE", {});

      const events = await store.listEventsForOrder(created.id);
      expect(events.map((e) => [e.fromStatus, e.toStatus])).toEqual([
        ["CREATED", "PAYMENT_PENDING"],
        ["PAYMENT_PENDING", "PAID"],
        ["PAID", "ENTITLEMENT_ACTIVE"],
      ]);
      expect(await store.listEventsForOrder(UNKNOWN_ID)).toEqual([]);
    });

    it("records entitlement/SIR/receipt progress, merging the patch and preserving earlier fields", async () => {
      const store = await make();
      const created = await store.create(BASE_INPUT);
      await store.transition(created.id, "CREATED", "PAID", {});

      const activated = await store.transition(created.id, "PAID", "ENTITLEMENT_ACTIVE", {
        entitlementRef: "ENT-1",
        entitlementExpiresAt: "2026-01-02T00:00:00.000Z",
      });
      expect(activated?.entitlementExpiresAt).toBe("2026-01-02T00:00:00.000Z");

      const sir = await store.transition(created.id, "ENTITLEMENT_ACTIVE", "ENTITLEMENT_ACTIVE", {
        sirRegisteredAt: "2026-01-02T00:01:00.000Z",
        sirSaleRef: "SALE-1",
      });
      expect(sir).toMatchObject({
        status: "ENTITLEMENT_ACTIVE",
        sirRegisteredAt: "2026-01-02T00:01:00.000Z",
        sirSaleRef: "SALE-1",
        entitlementRef: "ENT-1",
      });

      const flagged = await store.transition(created.id, "ENTITLEMENT_ACTIVE", "ENTITLEMENT_ACTIVE", {
        sirRegistrationAttempts: 4,
        sirReconciliationRequired: true,
        receiptIssuedAt: "2026-01-02T00:02:00.000Z",
        receiptRef: "R-1",
      });
      expect(flagged).toMatchObject({
        sirRegistrationAttempts: 4,
        sirReconciliationRequired: true,
        receiptRef: "R-1",
        sirSaleRef: "SALE-1",
      });
      expect(await store.listEventsForOrder(created.id)).toHaveLength(4);
    });

    it("listByStatus returns only orders currently in that status, oldest first", async () => {
      let clock = new Date("2026-01-01T00:00:00.000Z");
      const store = await make(() => clock);
      const a = await store.create(BASE_INPUT);
      clock = new Date("2026-01-01T00:00:01.000Z");
      const b = await store.create({ ...BASE_INPUT, idempotencyKey: "idem-key-2" });
      clock = new Date("2026-01-01T00:00:02.000Z");
      const c = await store.create({ ...BASE_INPUT, idempotencyKey: "idem-key-3" });
      await store.transition(a.id, "CREATED", "PAID", {});
      await store.transition(c.id, "CREATED", "PAID", {});

      expect((await store.listByStatus("PAID")).map((o) => o.id)).toEqual([a.id, c.id]);
      expect((await store.listByStatus("CREATED")).map((o) => o.id)).toEqual([b.id]);
      expect(await store.listByStatus("REFUNDED")).toEqual([]);
    });
  });
}
