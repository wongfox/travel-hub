import type { WebPushPort, PushSubscriptionRecord } from "../../modules/notifications/ports.js";
import type { AlertType, Locale } from "contracts";

export interface WebPushStub extends WebPushPort {
  /** Every `send` call this stub instance has accepted, in call order. */
  readonly sentPayloads: {
    endpoint: string;
    payload: { type: AlertType; titleKey: string; bodyKey: string; url: string; locale: Locale };
  }[];
  /** Test/dev-only: makes the next `send` call return `"failed"` once, then returns to normal. */
  simulateFailureOnce(): void;
}

/**
 * Deterministic, in-memory `WebPushPort` stub (design Decision 6, task
 * 11.1): no real `web-push` library call, no real VAPID keys — self-managed
 * VAPID is a `production`-only prerequisite enforced by the
 * `push.enabled` go-live guard (config/go-live-guards.ts), not something a
 * stub needs to exercise. Endpoint substrings deterministically select the
 * outcome, same "seeded, failure-injection switch" convention as
 * `createPaymentGatewayStub`: a real adapter would learn "gone" from the
 * push service's own 404/410 response, which this stub cannot receive.
 */
export function createWebPushStub(): WebPushStub {
  const sentPayloads: WebPushStub["sentPayloads"] = [];
  let failNext = false;

  return {
    sentPayloads,

    simulateFailureOnce() {
      failNext = true;
    },

    async send(subscription: PushSubscriptionRecord, payload) {
      sentPayloads.push({ endpoint: subscription.endpoint, payload });

      if (failNext) {
        failNext = false;
        return "failed";
      }
      if (subscription.endpoint.includes("gone-endpoint")) {
        return "gone";
      }
      if (subscription.endpoint.includes("fail-endpoint")) {
        return "failed";
      }
      return "sent";
    },
  };
}
