import { describe, expect, it } from "vitest";
import { createWifiOrder } from "./create-wifi-order.js";
import { createInMemoryWifiOrderStore } from "./wifi-order-store.js";
import { WifiPackageNotFoundError } from "./errors.js";
import type { PaymentGatewayPort, WifiPackageRecord, WifiPackageStore } from "./ports.js";

const PACKAGE: WifiPackageRecord = {
  id: "WIFI-60",
  code: "wifi-60",
  names: { es: "WiFi 60 minutos" },
  priceMinor: 1500,
  currency: "PEN",
  durationMinutes: 60,
};

function packageStoreOf(packages: WifiPackageRecord[]): Pick<WifiPackageStore, "findById"> {
  return { async findById(id) { return packages.find((p) => p.id === id) ?? null; } };
}

function fakePaymentGateway(): PaymentGatewayPort & { calls: number } {
  const sessions = new Map<string, { sessionRef: string; redirectUrl: string }>();
  const gateway = {
    calls: 0,
    async createHostedSession(input: Parameters<PaymentGatewayPort["createHostedSession"]>[0]) {
      gateway.calls += 1;
      const existing = sessions.get(input.idempotencyKey);
      if (existing) return existing;
      const sessionRef = `session-${sessions.size + 1}`;
      const record = { sessionRef, redirectUrl: `https://stub-gateway.local/pay/${sessionRef}` };
      sessions.set(input.idempotencyKey, record);
      return record;
    },
    async parseWebhook(): Promise<never> {
      throw new Error("not used in this test");
    },
    async refund() {
      return { refundRef: "refund-1" };
    },
  };
  return gateway;
}

function baseInput(overrides: Partial<Parameters<typeof createWifiOrder>[0]> = {}) {
  return {
    reservationRef: "RES-1001",
    passengerRef: "PAX-1",
    packageId: "WIFI-60",
    idempotencyKey: "idem-key-1",
    locale: "es" as const,
    returnUrl: "https://app.local/return",
    ...overrides,
  };
}

describe("createWifiOrder", () => {
  it("creates an order in PAYMENT_PENDING with a hosted-session redirect URL", async () => {
    const orderStore = createInMemoryWifiOrderStore();
    const paymentGateway = fakePaymentGateway();

    const result = await createWifiOrder(baseInput(), {
      orderStore,
      packageStore: packageStoreOf([PACKAGE]),
      paymentGateway,
    });

    expect(result.order.status).toBe("PAYMENT_PENDING");
    expect(result.order.amountMinor).toBe(1500);
    expect(result.order.currency).toBe("PEN");
    expect(result.redirectUrl).toMatch(/^https:\/\/stub-gateway\.local\/pay\//);
  });

  it("creating two orders with the same idempotency key produces one order, not two (task 10.1 acceptance)", async () => {
    const orderStore = createInMemoryWifiOrderStore();
    const paymentGateway = fakePaymentGateway();

    const first = await createWifiOrder(baseInput(), {
      orderStore,
      packageStore: packageStoreOf([PACKAGE]),
      paymentGateway,
    });
    const second = await createWifiOrder(baseInput(), {
      orderStore,
      packageStore: packageStoreOf([PACKAGE]),
      paymentGateway,
    });

    expect(second.order.id).toBe(first.order.id);
    expect(await orderStore.findByIdempotencyKey("idem-key-1")).not.toBeNull();
    const events = await orderStore.listEventsForOrder(first.order.id);
    // Only transitioned CREATED -> PAYMENT_PENDING once, not twice.
    expect(events).toHaveLength(1);
  });

  it("calls the payment gateway with the same idempotencyKey on replay, relying on gateway-level idempotency for the session", async () => {
    const orderStore = createInMemoryWifiOrderStore();
    const paymentGateway = fakePaymentGateway();

    const first = await createWifiOrder(baseInput(), {
      orderStore,
      packageStore: packageStoreOf([PACKAGE]),
      paymentGateway,
    });
    const second = await createWifiOrder(baseInput(), {
      orderStore,
      packageStore: packageStoreOf([PACKAGE]),
      paymentGateway,
    });

    expect(paymentGateway.calls).toBe(2);
    expect(second.redirectUrl).toBe(first.redirectUrl);
  });

  it("a crashed/failed attempt (gateway throws after the order row exists) succeeds on retry instead of getting stuck at CREATED (R3-gateway-retry-untested)", async () => {
    const orderStore = createInMemoryWifiOrderStore();
    const paymentGateway = fakePaymentGateway();
    const failingGateway: typeof paymentGateway = {
      ...paymentGateway,
      async createHostedSession() {
        throw new Error("simulated gateway timeout");
      },
    };

    await expect(
      createWifiOrder(baseInput(), {
        orderStore,
        packageStore: packageStoreOf([PACKAGE]),
        paymentGateway: failingGateway,
      }),
    ).rejects.toThrow(/simulated gateway timeout/);

    const stuck = await orderStore.findByIdempotencyKey("idem-key-1");
    expect(stuck?.status).toBe("CREATED");

    const retried = await createWifiOrder(baseInput(), {
      orderStore,
      packageStore: packageStoreOf([PACKAGE]),
      paymentGateway,
    });

    expect(retried.order.id).toBe(stuck?.id);
    expect(retried.order.status).toBe("PAYMENT_PENDING");
    const events = await orderStore.listEventsForOrder(retried.order.id);
    expect(events).toHaveLength(1);
  });

  it("throws WifiPackageNotFoundError for an unknown packageId", async () => {
    const orderStore = createInMemoryWifiOrderStore();
    const paymentGateway = fakePaymentGateway();

    await expect(
      createWifiOrder(baseInput({ packageId: "UNKNOWN" }), {
        orderStore,
        packageStore: packageStoreOf([PACKAGE]),
        paymentGateway,
      }),
    ).rejects.toBeInstanceOf(WifiPackageNotFoundError);
  });
});
