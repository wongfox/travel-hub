import { afterEach, describe, expect, it, vi } from "vitest";
import {
  runWifiEntitlementActivationJob,
  runSirAndReceiptJob,
  registerWifiOrderJobs,
  scheduleWifiOrderScans,
  WIFI_ENTITLEMENT_ACTIVATION_QUEUE,
  WIFI_SIR_RECEIPT_QUEUE,
  SIR_REGISTRATION_RETRY_LIMIT,
} from "./wifi-order-jobs.js";
import { createInMemoryWifiOrderStore } from "./wifi-order-store.js";
import { createWifiEntitlementStub } from "../../adapters/wifi-entitlement/stub.js";
import { createSirPosStub } from "../../adapters/sir-pos/stub.js";
import { createEReceiptStub } from "../../adapters/e-receipt/stub.js";
import { createPaymentGatewayStub } from "../../adapters/payment-gateway/stub.js";
import { createInMemoryQueueClient } from "../../infra/queue/queue-client.js";
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

async function createPaidOrder(orderStore: ReturnType<typeof createInMemoryWifiOrderStore>, idempotencyKey: string) {
  const created = await orderStore.create({
    reservationRef: "RES-1001",
    passengerRef: "PAX-1",
    packageId: "WIFI-60",
    amountMinor: 1500,
    currency: "PEN",
    idempotencyKey,
    legRef: "LEG-1",
    buyerEmail: "ana@example.com",
  });
  return orderStore.transition(created.id, "PAID", { gatewayPaymentRef: `payment-${idempotencyKey}` });
}

describe("runSirAndReceiptJob e-receipt line", () => {
  it("describes the receipt line with the package's commercial name, not the internal package id", async () => {
    const orderStore = createInMemoryWifiOrderStore();
    const created = await orderStore.create({
      reservationRef: "RES-1001",
      passengerRef: "PAX-1",
      packageId: "WIFI-60",
      amountMinor: 1500,
      currency: "PEN",
      idempotencyKey: "idem-receipt-desc",
      legRef: "LEG-1",
      buyerEmail: "ana@example.com",
    });
    await orderStore.transition(created.id, "ENTITLEMENT_ACTIVE", { entitlementRef: "ENT-1" });
    const issued: { lines: { description: string }[] }[] = [];
    const eReceipt = {
      async issue(input: { lines: { description: string }[] }) {
        issued.push(input);
        return { receiptRef: "R-1" };
      },
    };

    await runSirAndReceiptJob({
      orderStore,
      packageStore: packageStoreOf([PACKAGE]),
      entitlement: createWifiEntitlementStub(),
      sirPos: createSirPosStub(),
      eReceipt,
    });

    expect(issued).toHaveLength(1);
    expect(issued[0]?.lines[0]?.description).toBe("WiFi 60 minutos");
  });
});

describe("runWifiEntitlementActivationJob", () => {
  it("activates every PAID order, transitioning to ENTITLEMENT_ACTIVE", async () => {
    const orderStore = createInMemoryWifiOrderStore();
    const order = await createPaidOrder(orderStore, "idem-1");
    const entitlement = createWifiEntitlementStub();

    const result = await runWifiEntitlementActivationJob({
      orderStore,
      packageStore: packageStoreOf([PACKAGE]),
      entitlement,
      sirPos: createSirPosStub(),
      eReceipt: createEReceiptStub(),
    });

    expect(result).toEqual({ processed: 1, activated: 1, failed: 0 });
    const updated = await orderStore.findById(order.id);
    expect(updated?.status).toBe("ENTITLEMENT_ACTIVE");
  });

  it("one order's activation failure never blocks another's", async () => {
    const orderStore = createInMemoryWifiOrderStore();
    const a = await createPaidOrder(orderStore, "idem-a");
    const b = await createPaidOrder(orderStore, "idem-b");
    const entitlement = createWifiEntitlementStub();
    entitlement.simulateFailureOnce();

    const result = await runWifiEntitlementActivationJob({
      orderStore,
      packageStore: packageStoreOf([PACKAGE]),
      entitlement,
      sirPos: createSirPosStub(),
      eReceipt: createEReceiptStub(),
    });

    expect(result.processed).toBe(2);
    expect(result.activated).toBe(1);
    expect(result.failed).toBe(1);
    const orders = await Promise.all([orderStore.findById(a.id), orderStore.findById(b.id)]);
    const statuses = orders.map((o) => o?.status).sort();
    expect(statuses).toEqual(["ENTITLEMENT_ACTIVE", "PAID"]);
  });
});

describe("runSirAndReceiptJob", () => {
  it("order-of-operations: entitlement is active (entitlementRef set) before SIR registration/e-receipt are even attempted", async () => {
    const orderStore = createInMemoryWifiOrderStore();
    const order = await createPaidOrder(orderStore, "idem-order");
    const entitlement = createWifiEntitlementStub();
    const sirPos = createSirPosStub();
    const eReceipt = createEReceiptStub();

    // Activation runs first (this job's own entry condition is
    // ENTITLEMENT_ACTIVE, which does not exist yet), so SIR/receipt must not
    // run at all until activation has happened.
    const beforeActivation = await runSirAndReceiptJob({
      orderStore,
      packageStore: packageStoreOf([PACKAGE]),
      entitlement,
      sirPos,
      eReceipt,
    });
    expect(beforeActivation.processed).toBe(0);
    expect(sirPos.registerCalls).toHaveLength(0);
    expect(eReceipt.issueCalls).toHaveLength(0);

    await runWifiEntitlementActivationJob({
      orderStore,
      packageStore: packageStoreOf([PACKAGE]),
      entitlement,
      sirPos,
      eReceipt,
    });
    const activated = await orderStore.findById(order.id);
    expect(activated?.entitlementRef).not.toBeNull();

    await runSirAndReceiptJob({
      orderStore,
      packageStore: packageStoreOf([PACKAGE]),
      entitlement,
      sirPos,
      eReceipt,
    });

    expect(sirPos.registerCalls).toHaveLength(1);
    expect(eReceipt.issueCalls).toHaveLength(1);
    const final = await orderStore.findById(order.id);
    expect(final?.sirRegisteredAt).not.toBeNull();
    expect(final?.receiptIssuedAt).not.toBeNull();
    expect(final?.status).toBe("ENTITLEMENT_ACTIVE");
  });

  it("registers SIR sale and issues e-receipt independently: one failing does not block the other", async () => {
    const orderStore = createInMemoryWifiOrderStore();
    const created = await orderStore.create({
      reservationRef: "RES-1001",
      passengerRef: "PAX-1",
      packageId: "WIFI-60",
      amountMinor: 1500,
      currency: "PEN",
      idempotencyKey: "idem-indep",
      legRef: "LEG-1",
      buyerEmail: "ana@example.com",
    });
    await orderStore.transition(created.id, "ENTITLEMENT_ACTIVE", { entitlementRef: "ENT-1" });
    const sirPos = createSirPosStub();
    sirPos.simulateFailureOnce();
    const eReceipt = createEReceiptStub();

    const result = await runSirAndReceiptJob({
      orderStore,
      packageStore: packageStoreOf([PACKAGE]),
      entitlement: createWifiEntitlementStub(),
      sirPos,
      eReceipt,
    });

    expect(result.sirRegistered).toBe(0);
    expect(result.sirFailed).toBe(1);
    expect(result.receiptsIssued).toBe(1);
    const order = await orderStore.findById(created.id);
    expect(order?.sirRegisteredAt).toBeNull();
    expect(order?.receiptIssuedAt).not.toBeNull();
  });

  it("a fixture where SIR registration retries exhaust lands in reconciliation, not a refund (task 10.3 RED-worthy acceptance)", async () => {
    const orderStore = createInMemoryWifiOrderStore();
    const created = await orderStore.create({
      reservationRef: "RES-1001",
      passengerRef: "PAX-1",
      packageId: "WIFI-60",
      amountMinor: 1500,
      currency: "PEN",
      idempotencyKey: "idem-exhaust",
      legRef: "LEG-1",
      buyerEmail: "ana@example.com",
    });
    await orderStore.transition(created.id, "ENTITLEMENT_ACTIVE", { entitlementRef: "ENT-1" });

    const alwaysFailingSirPos = {
      registerCalls: [] as { idempotencyKey: string }[],
      async registerSale(_sale: unknown, idempotencyKey: string): Promise<{ saleRef: string }> {
        alwaysFailingSirPos.registerCalls.push({ idempotencyKey });
        throw new Error("simulated permanent SIR outage");
      },
      async voidSale(): Promise<void> {},
    };
    const eReceipt = createEReceiptStub();
    const paymentGateway = createPaymentGatewayStub();

    for (let attempt = 0; attempt <= SIR_REGISTRATION_RETRY_LIMIT; attempt += 1) {
      await runSirAndReceiptJob({
        orderStore,
        packageStore: packageStoreOf([PACKAGE]),
        entitlement: createWifiEntitlementStub(),
        sirPos: alwaysFailingSirPos,
        eReceipt,
      });
    }

    const order = await orderStore.findById(created.id);
    expect(order?.sirReconciliationRequired).toBe(true);
    expect(order?.sirRegistrationAttempts).toBeGreaterThan(SIR_REGISTRATION_RETRY_LIMIT);
    expect(order?.status).toBe("ENTITLEMENT_ACTIVE"); // never transitioned to REFUND_PENDING/REFUNDED
    expect(paymentGateway.refundCalls).toHaveLength(0);

    // Once flagged, further scans do not keep retrying this order.
    const callsBefore = alwaysFailingSirPos.registerCalls.length;
    await runSirAndReceiptJob({
      orderStore,
      packageStore: packageStoreOf([PACKAGE]),
      entitlement: createWifiEntitlementStub(),
      sirPos: alwaysFailingSirPos,
      eReceipt,
    });
    expect(alwaysFailingSirPos.registerCalls).toHaveLength(callsBefore);
  });

  it("an unresolvable package also counts toward SIR retry exhaustion, reaching reconciliation instead of retrying forever (R3-sir-reconciliation-escape-gap)", async () => {
    const orderStore = createInMemoryWifiOrderStore();
    const created = await orderStore.create({
      reservationRef: "RES-1001",
      passengerRef: "PAX-1",
      packageId: "RETIRED-PACKAGE",
      amountMinor: 1500,
      currency: "PEN",
      idempotencyKey: "idem-unresolvable-package",
      legRef: "LEG-1",
      buyerEmail: "ana@example.com",
    });
    await orderStore.transition(created.id, "ENTITLEMENT_ACTIVE", { entitlementRef: "ENT-1" });
    const sirPos = createSirPosStub();
    const eReceipt = createEReceiptStub();

    for (let attempt = 0; attempt <= SIR_REGISTRATION_RETRY_LIMIT; attempt += 1) {
      await runSirAndReceiptJob({
        orderStore,
        // The package was never seeded, so every lookup resolves null —
        // this must count as a failed attempt, not throw past the tracking.
        packageStore: packageStoreOf([]),
        entitlement: createWifiEntitlementStub(),
        sirPos,
        eReceipt,
      });
    }

    const order = await orderStore.findById(created.id);
    expect(order?.sirReconciliationRequired).toBe(true);
    expect(order?.sirRegistrationAttempts).toBeGreaterThan(SIR_REGISTRATION_RETRY_LIMIT);
    expect(sirPos.registerCalls).toHaveLength(0);
  });

  it("one order's SIR/receipt failure never blocks another order's processing", async () => {
    const orderStore = createInMemoryWifiOrderStore();
    const failing = await orderStore.create({
      reservationRef: "RES-1001",
      passengerRef: "PAX-1",
      packageId: "WIFI-60",
      amountMinor: 1500,
      currency: "PEN",
      idempotencyKey: "idem-fail",
      legRef: "LEG-1",
      buyerEmail: "ana@example.com",
    });
    await orderStore.transition(failing.id, "ENTITLEMENT_ACTIVE", { entitlementRef: "ENT-1" });
    const healthy = await orderStore.create({
      reservationRef: "RES-1002",
      passengerRef: "PAX-2",
      packageId: "WIFI-60",
      amountMinor: 1500,
      currency: "PEN",
      idempotencyKey: "idem-healthy",
      legRef: "LEG-1",
      buyerEmail: "ana2@example.com",
    });
    await orderStore.transition(healthy.id, "ENTITLEMENT_ACTIVE", { entitlementRef: "ENT-2" });

    const sirPos = createSirPosStub();
    sirPos.simulateFailureOnce();
    const eReceipt = createEReceiptStub();
    eReceipt.simulateFailureOnce();

    const result = await runSirAndReceiptJob({
      orderStore,
      packageStore: packageStoreOf([PACKAGE]),
      entitlement: createWifiEntitlementStub(),
      sirPos,
      eReceipt,
    });

    expect(result.processed).toBe(2);
    // Exactly one of the two orders failed SIR and exactly one failed receipt
    // (the simulated single failure lands on whichever order is processed
    // first), but both orders were still attempted for both independent
    // steps — neither order's SIR/receipt outcome was skipped because of
    // the other order's failure.
    expect(result.sirRegistered + result.sirFailed).toBe(2);
    expect(result.receiptsIssued + result.receiptsFailed).toBe(2);
  });
});

describe("registerWifiOrderJobs", () => {
  it("wires both jobs onto the queue client", async () => {
    const orderStore = createInMemoryWifiOrderStore();
    const order = await createPaidOrder(orderStore, "idem-queue");
    const queueClient = createInMemoryQueueClient();
    await queueClient.start();

    await registerWifiOrderJobs(queueClient, {
      orderStore,
      packageStore: packageStoreOf([PACKAGE]),
      entitlement: createWifiEntitlementStub(),
      sirPos: createSirPosStub(),
      eReceipt: createEReceiptStub(),
    });

    await queueClient.sendIdempotent(WIFI_ENTITLEMENT_ACTIVATION_QUEUE, "scan", {});
    await queueClient.runPendingOnce(WIFI_ENTITLEMENT_ACTIVATION_QUEUE);
    const activated = await orderStore.findById(order.id);
    expect(activated?.status).toBe("ENTITLEMENT_ACTIVE");

    await queueClient.sendIdempotent(WIFI_SIR_RECEIPT_QUEUE, "scan", {});
    await queueClient.runPendingOnce(WIFI_SIR_RECEIPT_QUEUE);
    const final = await orderStore.findById(order.id);
    expect(final?.sirRegisteredAt).not.toBeNull();
    expect(final?.receiptIssuedAt).not.toBeNull();
  });
});

describe("scheduleWifiOrderScans", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("enqueues both scans on every interval tick so paid orders get activated without a manual trigger, and stops when asked", async () => {
    vi.useFakeTimers();
    const orderStore = createInMemoryWifiOrderStore();
    const order = await createPaidOrder(orderStore, "idem-scheduled");
    const queueClient = createInMemoryQueueClient();
    await queueClient.start();
    await registerWifiOrderJobs(queueClient, {
      orderStore,
      packageStore: packageStoreOf([PACKAGE]),
      entitlement: createWifiEntitlementStub(),
      sirPos: createSirPosStub(),
      eReceipt: createEReceiptStub(),
    });

    const stop = scheduleWifiOrderScans(queueClient, { intervalMs: 1000 });

    // Nothing is enqueued before the first tick.
    await queueClient.runPendingOnce(WIFI_ENTITLEMENT_ACTIVATION_QUEUE);
    expect((await orderStore.findById(order.id))?.status).toBe("PAID");

    await vi.advanceTimersByTimeAsync(1000);
    await queueClient.runPendingOnce(WIFI_ENTITLEMENT_ACTIVATION_QUEUE);
    expect((await orderStore.findById(order.id))?.status).toBe("ENTITLEMENT_ACTIVE");

    await queueClient.runPendingOnce(WIFI_SIR_RECEIPT_QUEUE);
    const final = await orderStore.findById(order.id);
    expect(final?.sirRegisteredAt).not.toBeNull();
    expect(final?.receiptIssuedAt).not.toBeNull();

    stop();
    const second = await createPaidOrder(orderStore, "idem-after-stop");
    await vi.advanceTimersByTimeAsync(5000);
    await queueClient.runPendingOnce(WIFI_ENTITLEMENT_ACTIVATION_QUEUE);
    expect((await orderStore.findById(second.id))?.status).toBe("PAID");
  });

  it("keeps ticking when a send fails (a queue outage must not kill the scheduler)", async () => {
    vi.useFakeTimers();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    let calls = 0;
    const queueClient = {
      async sendIdempotent() {
        calls += 1;
        throw new Error("queue down");
      },
    };

    const stop = scheduleWifiOrderScans(queueClient as never, { intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(2000);
    stop();

    expect(calls).toBe(4);
    errors.mockRestore();
  });
});
