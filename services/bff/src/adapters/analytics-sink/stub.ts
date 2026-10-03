import type { AnalyticsSinkPort, PseudonymousAnalyticsEvent } from "../../modules/analytics/ports.js";

export interface AnalyticsSinkStub extends AnalyticsSinkPort {
  /** Every batch this stub instance has accepted, in call order (test/dev-only introspection). */
  readonly deliveries: PseudonymousAnalyticsEvent[][];
  /** Test/dev-only: makes the next `forward` call reject once, then succeed normally. */
  simulateFailureOnce(): void;
}

/**
 * Deterministic, in-memory `AnalyticsSinkPort` stub (design Decision 6):
 * records every forwarded batch for inspection, same convention as
 * `PaymentGatewayStub`'s `createdSessions`/`StaffAlertStub`'s `deliveries`.
 */
export function createAnalyticsSinkStub(): AnalyticsSinkStub {
  const deliveries: PseudonymousAnalyticsEvent[][] = [];
  let failNext = false;

  return {
    deliveries,

    simulateFailureOnce() {
      failNext = true;
    },

    async forward(events: PseudonymousAnalyticsEvent[]): Promise<void> {
      if (failNext) {
        failNext = false;
        throw new Error("simulated AnalyticsSinkPort failure");
      }
      deliveries.push(events);
    },
  };
}
