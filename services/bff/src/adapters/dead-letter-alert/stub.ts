import type { DeadLetterAlert, DeadLetterAlertPort } from "../../modules/observability/ports.js";

export interface DeadLetterAlertStub extends DeadLetterAlertPort {
  /** Every alert this stub instance has been notified of, in call order. */
  readonly notifications: DeadLetterAlert[];
  /** Test/dev-only: makes the next `notify` call reject once, then succeed normally. */
  simulateFailureOnce(): void;
}

/**
 * Deterministic, in-memory `DeadLetterAlertPort` stub (design Decision 6,
 * same convention as `StaffAlertStub`): no alerting vendor/channel is chosen
 * for task 13.3's "alerting hook for dead-letter jobs", so this stub only
 * records that an alert was raised.
 */
export function createDeadLetterAlertStub(): DeadLetterAlertStub {
  const notifications: DeadLetterAlert[] = [];
  let failNext = false;

  return {
    notifications,

    simulateFailureOnce() {
      failNext = true;
    },

    async notify(alert: DeadLetterAlert) {
      if (failNext) {
        failNext = false;
        throw new Error("simulated DeadLetterAlertPort failure");
      }
      notifications.push(alert);
    },
  };
}
