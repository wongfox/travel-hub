import { describe, expect, it } from "vitest";
import { handlePaymentWebhook } from "./handle-payment-webhook.js";
import { createInMemoryWifiOrderStore } from "./wifi-order-store.js";
import { InvalidWebhookSignatureError, WifiOrderNotFoundError } from "./errors.js";
import type { PaymentEvent } from "contracts";
import type { PaymentGatewayPort } from "./ports.js";

function gatewayResolving(event: PaymentEvent | Error): Pick<PaymentGatewayPort, "parseWebhook"> {
  return {
    async parseWebhook() {
      if (event instanceof Error) throw event;
      return event;
    },
  };
}

const RAW_BODY = Buffer.from("irrelevant-in-these-tests");
const HEADERS = {};

describe("handlePaymentWebhook", () => {
  it("rejects an invalid/missing signature and never transitions order state (task 10.2 RED-worthy acceptance)", async () => {
    const orderStore = createInMemoryWifiOrderStore();
    const created = await orderStore.create({
      reservationRef: "RES-1001",
      passengerRef: "PAX-1",
      packageId: "WIFI-60",
      amountMinor: 1500,
      currency: "PEN",
      idempotencyKey: "idem-key-1",
    });

    await expect(
      handlePaymentWebhook(RAW_BODY, HEADERS, {
        paymentGateway: gatewayResolving(new InvalidWebhookSignatureError()),
        orderStore,
      }),
    ).rejects.toBeInstanceOf(InvalidWebhookSignatureError);

    const unchanged = await orderStore.findById(created.id);
    expect(unchanged?.status).toBe("CREATED");
    expect(await orderStore.listEventsForOrder(created.id)).toHaveLength(0);
  });

  it("transitions CREATED -> PAID on a payment_succeeded event matching the order's idempotency key", async () => {
    const orderStore = createInMemoryWifiOrderStore();
    const created = await orderStore.create({
      reservationRef: "RES-1001",
      passengerRef: "PAX-1",
      packageId: "WIFI-60",
      amountMinor: 1500,
      currency: "PEN",
      idempotencyKey: "idem-key-1",
    });

    const result = await handlePaymentWebhook(RAW_BODY, HEADERS, {
      paymentGateway: gatewayResolving({
        type: "payment_succeeded",
        providerRef: "provider-ref-1",
        orderIdempotencyKey: "idem-key-1",
        amountMinor: 1500,
        currency: "PEN",
        occurredAt: "2026-01-01T00:00:00.000Z",
      }),
      orderStore,
    });

    expect(result.applied).toBe(true);
    const updated = await orderStore.findById(created.id);
    expect(updated?.status).toBe("PAID");
    expect(updated?.gatewayPaymentRef).toBe("provider-ref-1");
  });

  it("transitions to PAYMENT_FAILED on a payment_failed event", async () => {
    const orderStore = createInMemoryWifiOrderStore();
    const created = await orderStore.create({
      reservationRef: "RES-1001",
      passengerRef: "PAX-1",
      packageId: "WIFI-60",
      amountMinor: 1500,
      currency: "PEN",
      idempotencyKey: "idem-key-2",
    });

    await handlePaymentWebhook(RAW_BODY, HEADERS, {
      paymentGateway: gatewayResolving({
        type: "payment_failed",
        providerRef: "provider-ref-2",
        orderIdempotencyKey: "idem-key-2",
        amountMinor: 1500,
        currency: "PEN",
        occurredAt: "2026-01-01T00:00:00.000Z",
      }),
      orderStore,
    });

    const updated = await orderStore.findById(created.id);
    expect(updated?.status).toBe("PAYMENT_FAILED");
  });

  it("replaying the same valid webhook event twice does not double-transition order state (task 10.2 RED-worthy acceptance)", async () => {
    const orderStore = createInMemoryWifiOrderStore();
    const created = await orderStore.create({
      reservationRef: "RES-1001",
      passengerRef: "PAX-1",
      packageId: "WIFI-60",
      amountMinor: 1500,
      currency: "PEN",
      idempotencyKey: "idem-key-3",
    });
    const event: PaymentEvent = {
      type: "payment_succeeded",
      providerRef: "provider-ref-3",
      orderIdempotencyKey: "idem-key-3",
      amountMinor: 1500,
      currency: "PEN",
      occurredAt: "2026-01-01T00:00:00.000Z",
    };

    const first = await handlePaymentWebhook(RAW_BODY, HEADERS, { paymentGateway: gatewayResolving(event), orderStore });
    const second = await handlePaymentWebhook(RAW_BODY, HEADERS, { paymentGateway: gatewayResolving(event), orderStore });

    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
    const updated = await orderStore.findById(created.id);
    expect(updated?.status).toBe("PAID");
    // Exactly one wifi_order_event row for this transition, not two.
    const events = await orderStore.listEventsForOrder(created.id);
    expect(events.filter((e) => e.toStatus === "PAID")).toHaveLength(1);
  });

  it("throws WifiOrderNotFoundError when no order matches the event's idempotency key", async () => {
    const orderStore = createInMemoryWifiOrderStore();

    await expect(
      handlePaymentWebhook(RAW_BODY, HEADERS, {
        paymentGateway: gatewayResolving({
          type: "payment_succeeded",
          providerRef: "provider-ref-x",
          orderIdempotencyKey: "unknown-key",
          amountMinor: 1500,
          currency: "PEN",
          occurredAt: "2026-01-01T00:00:00.000Z",
        }),
        orderStore,
      }),
    ).rejects.toBeInstanceOf(WifiOrderNotFoundError);
  });

  it("is a no-op when the event carries no orderIdempotencyKey", async () => {
    const orderStore = createInMemoryWifiOrderStore();

    const result = await handlePaymentWebhook(RAW_BODY, HEADERS, {
      paymentGateway: gatewayResolving({
        type: "payment_succeeded",
        providerRef: "provider-ref-y",
        orderIdempotencyKey: null,
        amountMinor: 1500,
        currency: "PEN",
        occurredAt: "2026-01-01T00:00:00.000Z",
      }),
      orderStore,
    });

    expect(result.applied).toBe(false);
  });

  it("does not transition an order that is already past a webhook-reachable state (e.g. already PAID)", async () => {
    const orderStore = createInMemoryWifiOrderStore();
    const created = await orderStore.create({
      reservationRef: "RES-1001",
      passengerRef: "PAX-1",
      packageId: "WIFI-60",
      amountMinor: 1500,
      currency: "PEN",
      idempotencyKey: "idem-key-4",
    });
    await orderStore.transition(created.id, "CREATED", "PAID", { gatewayPaymentRef: "provider-ref-4a" });

    const result = await handlePaymentWebhook(RAW_BODY, HEADERS, {
      paymentGateway: gatewayResolving({
        type: "payment_succeeded",
        providerRef: "provider-ref-4b",
        orderIdempotencyKey: "idem-key-4",
        amountMinor: 1500,
        currency: "PEN",
        occurredAt: "2026-01-01T00:00:00.000Z",
      }),
      orderStore,
    });

    expect(result.applied).toBe(false);
    const unchanged = await orderStore.findById(created.id);
    expect(unchanged?.gatewayPaymentRef).toBe("provider-ref-4a");
  });

  it("a CAS miss (another writer advanced the order first) is a no-op, not an error", async () => {
    const inner = createInMemoryWifiOrderStore();
    const created = await inner.create({
      reservationRef: "RES-1001",
      passengerRef: "PAX-1",
      packageId: "WIFI-60",
      amountMinor: 1500,
      currency: "PEN",
      idempotencyKey: "idem-cas",
    });
    const orderStore = { ...inner, transition: async () => null };

    const result = await handlePaymentWebhook(RAW_BODY, HEADERS, {
      paymentGateway: gatewayResolving({
        type: "payment_succeeded",
        providerRef: "pay-1",
        orderIdempotencyKey: "idem-cas",
        amountMinor: 1500,
        currency: "PEN",
      } as PaymentEvent),
      orderStore,
    });

    expect(result).toEqual({ applied: false, orderId: created.id });
  });
});
