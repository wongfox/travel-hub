import { describe, expect, it } from "vitest";
import { createPaymentGatewayStub } from "./stub.js";
import { InvalidWebhookSignatureError } from "../../modules/wifi-checkout/errors.js";

describe("createPaymentGatewayStub", () => {
  it("createHostedSession returns a sessionRef and redirectUrl, recording the call", async () => {
    const gateway = createPaymentGatewayStub();

    const result = await gateway.createHostedSession({
      orderId: "order-1",
      amountMinor: 1500,
      currency: "PEN",
      returnUrl: "https://app.local/return",
      locale: "es",
      idempotencyKey: "idem-1",
    });

    expect(result.sessionRef).toBeTruthy();
    expect(result.redirectUrl).toContain(result.sessionRef);
    expect(gateway.createdSessions).toEqual([{ orderId: "order-1", idempotencyKey: "idem-1" }]);
  });

  it("createHostedSession is idempotent: the same idempotencyKey returns the same session on a second call", async () => {
    const gateway = createPaymentGatewayStub();

    const first = await gateway.createHostedSession({
      orderId: "order-1",
      amountMinor: 1500,
      currency: "PEN",
      returnUrl: "https://app.local/return",
      locale: "es",
      idempotencyKey: "idem-1",
    });
    const second = await gateway.createHostedSession({
      orderId: "order-1",
      amountMinor: 1500,
      currency: "PEN",
      returnUrl: "https://app.local/return",
      locale: "es",
      idempotencyKey: "idem-1",
    });

    expect(second.sessionRef).toBe(first.sessionRef);
    expect(second.redirectUrl).toBe(first.redirectUrl);
  });

  it("simulateFailureOnce makes the next createHostedSession call reject once, then succeed", async () => {
    const gateway = createPaymentGatewayStub();
    gateway.simulateFailureOnce();

    await expect(
      gateway.createHostedSession({
        orderId: "order-1",
        amountMinor: 1500,
        currency: "PEN",
        returnUrl: "https://app.local/return",
        locale: "es",
        idempotencyKey: "idem-1",
      }),
    ).rejects.toThrow(/simulated/);

    await expect(
      gateway.createHostedSession({
        orderId: "order-1",
        amountMinor: 1500,
        currency: "PEN",
        returnUrl: "https://app.local/return",
        locale: "es",
        idempotencyKey: "idem-2",
      }),
    ).resolves.toBeTruthy();
  });

  it("parseWebhook accepts a correctly signed payload built via buildWebhookRequest", async () => {
    const gateway = createPaymentGatewayStub();
    const { rawBody, headers } = gateway.buildWebhookRequest({
      type: "payment_succeeded",
      providerRef: "provider-ref-1",
      orderIdempotencyKey: "idem-1",
      amountMinor: 1500,
      currency: "PEN",
    });

    const event = await gateway.parseWebhook(rawBody, headers);

    expect(event).toMatchObject({ type: "payment_succeeded", providerRef: "provider-ref-1" });
  });

  it("parseWebhook rejects a tampered signature", async () => {
    const gateway = createPaymentGatewayStub();
    const { rawBody, headers } = gateway.buildWebhookRequest({
      type: "payment_succeeded",
      providerRef: "provider-ref-1",
      orderIdempotencyKey: "idem-1",
      amountMinor: 1500,
      currency: "PEN",
      tamperSignature: true,
    });

    await expect(gateway.parseWebhook(rawBody, headers)).rejects.toBeInstanceOf(InvalidWebhookSignatureError);
  });

  it("parseWebhook rejects a missing signature header", async () => {
    const gateway = createPaymentGatewayStub();
    const { rawBody, headers } = gateway.buildWebhookRequest({
      type: "payment_succeeded",
      providerRef: "provider-ref-1",
      orderIdempotencyKey: "idem-1",
      amountMinor: 1500,
      currency: "PEN",
      omitSignature: true,
    });

    await expect(gateway.parseWebhook(rawBody, headers)).rejects.toBeInstanceOf(InvalidWebhookSignatureError);
  });

  it("parseWebhook rejects a body that was mutated after signing", async () => {
    const gateway = createPaymentGatewayStub();
    const { rawBody, headers } = gateway.buildWebhookRequest({
      type: "payment_succeeded",
      providerRef: "provider-ref-1",
      orderIdempotencyKey: "idem-1",
      amountMinor: 1500,
      currency: "PEN",
    });
    const mutatedBody = Buffer.from(rawBody.toString("utf8").replace("provider-ref-1", "provider-ref-evil"));

    await expect(gateway.parseWebhook(mutatedBody, headers)).rejects.toBeInstanceOf(InvalidWebhookSignatureError);
  });

  it("refund returns a refundRef", async () => {
    const gateway = createPaymentGatewayStub();

    const result = await gateway.refund("payment-ref-1", 500, "idem-refund-1");

    expect(result.refundRef).toBeTruthy();
  });

  it("refund is idempotent: a repeated idempotencyKey returns the same refundRef, not a second refund (R4-002)", async () => {
    const gateway = createPaymentGatewayStub();

    const first = await gateway.refund("payment-ref-2", 500, "idem-refund-dup");
    const second = await gateway.refund("payment-ref-2", 500, "idem-refund-dup");

    expect(second.refundRef).toBe(first.refundRef);
    expect(gateway.refundCalls).toHaveLength(2);
  });
});
