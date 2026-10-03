import { describe, expect, it } from "vitest";
import { activateWifiOrder } from "./activate-wifi-order.js";
import { createInMemoryWifiOrderStore } from "./wifi-order-store.js";
import { createWifiEntitlementStub } from "../../adapters/wifi-entitlement/stub.js";
import { WifiOrderNotFoundError, WifiPackageNotFoundError } from "./errors.js";
import type { WifiPackageRecord, WifiPackageStore } from "./ports.js";

const PACKAGE: WifiPackageRecord = {
  id: "WIFI-60",
  code: "wifi-60",
  names: { es: "WiFi 60 minutos" },
  priceMinor: 1500,
  currency: "PEN",
  durationMinutes: 60,
};

function packageStoreOf(packages: WifiPackageRecord[]): Pick<WifiPackageStore, "findById"> {
  return {
    async findById(id) {
      return packages.find((p) => p.id === id) ?? null;
    },
  };
}

describe("activateWifiOrder", () => {
  it("grants entitlement and transitions PAID -> ENTITLEMENT_ACTIVE (task 10.3)", async () => {
    const orderStore = createInMemoryWifiOrderStore(() => new Date("2026-01-01T00:00:00.000Z"));
    const created = await orderStore.create({
      reservationRef: "RES-1001",
      passengerRef: "PAX-1",
      packageId: "WIFI-60",
      amountMinor: 1500,
      currency: "PEN",
      idempotencyKey: "idem-1",
      legRef: "LEG-1",
    });
    await orderStore.transition(created.id, "PAID", { gatewayPaymentRef: "payment-1" });
    const entitlement = createWifiEntitlementStub();

    const activated = await activateWifiOrder(created.id, {
      orderStore,
      packageStore: packageStoreOf([PACKAGE]),
      entitlement,
    });

    expect(activated.status).toBe("ENTITLEMENT_ACTIVE");
    expect(activated.entitlementRef).not.toBeNull();
    expect(activated.entitlementExpiresAt).not.toBeNull();
    expect(entitlement.grantCalls).toHaveLength(1);
  });

  it("passes legRef/packageCode/durationMinutes from the order+package through to the entitlement grant", async () => {
    const orderStore = createInMemoryWifiOrderStore();
    const created = await orderStore.create({
      reservationRef: "RES-1001",
      passengerRef: "PAX-1",
      packageId: "WIFI-60",
      amountMinor: 1500,
      currency: "PEN",
      idempotencyKey: "idem-2",
      legRef: "LEG-42",
    });
    await orderStore.transition(created.id, "PAID", {});
    const grantInputs: unknown[] = [];
    const entitlement = {
      async grant(input: unknown) {
        grantInputs.push(input);
        return { entitlementRef: "ENT-1" };
      },
    };

    await activateWifiOrder(created.id, { orderStore, packageStore: packageStoreOf([PACKAGE]), entitlement });

    expect(grantInputs).toEqual([
      { orderId: created.id, packageCode: "wifi-60", durationMinutes: 60, legRef: "LEG-42" },
    ]);
  });

  it("is idempotent: calling it again once already ENTITLEMENT_ACTIVE does not grant a second entitlement", async () => {
    const orderStore = createInMemoryWifiOrderStore();
    const created = await orderStore.create({
      reservationRef: "RES-1001",
      passengerRef: "PAX-1",
      packageId: "WIFI-60",
      amountMinor: 1500,
      currency: "PEN",
      idempotencyKey: "idem-3",
      legRef: "LEG-1",
    });
    await orderStore.transition(created.id, "PAID", {});
    const entitlement = createWifiEntitlementStub();

    await activateWifiOrder(created.id, { orderStore, packageStore: packageStoreOf([PACKAGE]), entitlement });
    const second = await activateWifiOrder(created.id, {
      orderStore,
      packageStore: packageStoreOf([PACKAGE]),
      entitlement,
    });

    expect(second.status).toBe("ENTITLEMENT_ACTIVE");
    expect(entitlement.grantCalls).toHaveLength(1);
  });

  it("is a no-op for an order not in PAID status (e.g. still PAYMENT_PENDING)", async () => {
    const orderStore = createInMemoryWifiOrderStore();
    const created = await orderStore.create({
      reservationRef: "RES-1001",
      passengerRef: "PAX-1",
      packageId: "WIFI-60",
      amountMinor: 1500,
      currency: "PEN",
      idempotencyKey: "idem-4",
      legRef: "LEG-1",
    });
    const entitlement = createWifiEntitlementStub();

    const result = await activateWifiOrder(created.id, {
      orderStore,
      packageStore: packageStoreOf([PACKAGE]),
      entitlement,
    });

    expect(result.status).toBe("CREATED");
    expect(entitlement.grantCalls).toHaveLength(0);
  });

  it("throws WifiOrderNotFoundError for an unknown order id", async () => {
    const orderStore = createInMemoryWifiOrderStore();
    const entitlement = createWifiEntitlementStub();

    await expect(
      activateWifiOrder("unknown-id", { orderStore, packageStore: packageStoreOf([PACKAGE]), entitlement }),
    ).rejects.toBeInstanceOf(WifiOrderNotFoundError);
  });

  it("throws WifiPackageNotFoundError if the order's package no longer resolves", async () => {
    const orderStore = createInMemoryWifiOrderStore();
    const created = await orderStore.create({
      reservationRef: "RES-1001",
      passengerRef: "PAX-1",
      packageId: "WIFI-60",
      amountMinor: 1500,
      currency: "PEN",
      idempotencyKey: "idem-5",
      legRef: "LEG-1",
    });
    await orderStore.transition(created.id, "PAID", {});
    const entitlement = createWifiEntitlementStub();

    await expect(
      activateWifiOrder(created.id, { orderStore, packageStore: packageStoreOf([]), entitlement }),
    ).rejects.toBeInstanceOf(WifiPackageNotFoundError);
  });
});
