import type { ConformanceSpec } from "../_conformance-harness/conformance-harness.js";
import type { PaymentGatewayPort } from "../../modules/wifi-checkout/ports.js";

/**
 * Conformance suite for `PaymentGatewayPort` (design Decision 6): runs
 * against the stub in CI, and against a real payment gateway adapter once
 * one is chosen (design's Open Questions). `parseWebhook`'s signature
 * verification is adapter-specific (each gateway signs differently) and is
 * exercised instead by each adapter's own tests (see `stub.test.ts`), the
 * same scoping `content.contract.ts` applies to adapter-specific behavior.
 */
export const paymentGatewayContract: ConformanceSpec<PaymentGatewayPort> = {
  cases: [
    {
      name: "createHostedSession returns a non-empty sessionRef and redirectUrl",
      async run(port) {
        const result = await port.createHostedSession({
          orderId: "order-1",
          amountMinor: 1500,
          currency: "PEN",
          returnUrl: "https://app.local/return",
          locale: "es",
          idempotencyKey: "idem-contract-1",
        });
        if (!result.sessionRef || !result.redirectUrl) {
          throw new Error("createHostedSession did not return a sessionRef/redirectUrl");
        }
      },
    },
    {
      name: "createHostedSession is idempotent: a repeated idempotencyKey returns the same session",
      async run(port) {
        const first = await port.createHostedSession({
          orderId: "order-2",
          amountMinor: 1500,
          currency: "PEN",
          returnUrl: "https://app.local/return",
          locale: "es",
          idempotencyKey: "idem-contract-2",
        });
        const second = await port.createHostedSession({
          orderId: "order-2",
          amountMinor: 1500,
          currency: "PEN",
          returnUrl: "https://app.local/return",
          locale: "es",
          idempotencyKey: "idem-contract-2",
        });
        if (first.sessionRef !== second.sessionRef) {
          throw new Error("createHostedSession created a second session for a repeated idempotencyKey");
        }
      },
    },
    {
      name: "refund returns a non-empty refundRef",
      async run(port) {
        const result = await port.refund("payment-ref-contract-1", 500, "idem-contract-refund-1");
        if (!result.refundRef) {
          throw new Error("refund did not return a refundRef");
        }
      },
    },
  ],
};
