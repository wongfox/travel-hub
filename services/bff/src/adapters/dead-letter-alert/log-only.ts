import type { DeadLetterAlert, DeadLetterAlertPort } from "../../modules/observability/ports.js";

export interface DeadLetterAlertLogOnlyDeps {
  /** Injected so this adapter never depends on a concrete logger implementation; the redacting logger (task 3.5) is the real caller. */
  log: (alert: DeadLetterAlert) => void;
}

/**
 * `DeadLetterAlertPort`'s other adapter (same `stub`/`log-only` adapter-pair
 * convention used elsewhere in this codebase for a not-yet-chosen
 * integration, design Decision 12): logs the alert instead of only recording
 * it in memory, for an environment where a
 * real alerting integration (PagerDuty, a chat webhook, an email list — none
 * chosen) does not exist yet but a durable, auditable record of every
 * dead-letter event is wanted. `DeadLetterAlert` carries only queue names,
 * a count and a timestamp — no passenger data ever reaches this log line.
 */
export function createDeadLetterAlertLogOnlyAdapter(deps: DeadLetterAlertLogOnlyDeps): DeadLetterAlertPort {
  return {
    async notify(alert: DeadLetterAlert) {
      deps.log(alert);
    },
  };
}
