import type { PiiAccessAuditPort } from "../../infra/audit/pii-access-audit.js";
import type { QueueClient, QueueRetryPolicy } from "../../infra/queue/queue-client.js";
import type { PulseResponseStore, StaffAlertStore } from "./ports.js";

const PURGE_ACTOR = "worker:pulse-purge-job";

/** Worker queue this job registers on (task 12.3), following `registerPurgeJob`'s (precheckin's) exact convention; triggered on the deployment's own scheduler cadence (Phase 13's scope — out of this task). */
export const PULSE_PURGE_QUEUE = "pulse-purge";
export const PULSE_PURGE_RETRY_POLICY: QueueRetryPolicy = { retryLimit: 3, retryBackoffSeconds: 30 };

export interface PulsePurgeJobDeps {
  pulseResponseStore: Pick<PulseResponseStore, "listPastPurgeAfter" | "deleteById">;
  staffAlertStore: Pick<StaffAlertStore, "listPastPurgeAfter" | "deleteById">;
  piiAccessAudit: PiiAccessAuditPort;
  /** Injectable clock for deterministic tests; defaults to `Date.now`. */
  now?: () => Date;
}

export interface PulsePurgeJobResult {
  purgedResponses: number;
  purgedAlerts: number;
  failed: number;
}

/**
 * `experience-pulse` retention/purge scheduler (task 12.3, design Security
 * section: "`staff_alert.payload` and `pulse_response` purge at
 * `answered_at + STAFF_ALERT_RETENTION_DAYS`"). `pulse_response` and
 * `staff_alert` are scanned and purged independently — a `pulse_response`
 * with no `staff_alert` row (negative-response alerting was off, or the
 * response was never negative) still purges on its own schedule, and a
 * `staff_alert` purges even if deleting its parent response in this same run
 * happened to fail. Each item's deletion is isolated by a real try/catch
 * (same convention as `runHandoffJob`/`runPushSubscriptionPurgeJob`) and
 * never blocks another item's purge. Every purge writes a
 * `pii_access_audit` entry (task 12.3).
 */
export async function runPulsePurgeJob(deps: PulsePurgeJobDeps): Promise<PulsePurgeJobResult> {
  const now = deps.now ? deps.now() : new Date();

  const dueResponses = await deps.pulseResponseStore.listPastPurgeAfter(now);
  let purgedResponses = 0;
  let failed = 0;
  for (const response of dueResponses) {
    try {
      await deps.pulseResponseStore.deleteById(response.id);
      await deps.piiAccessAudit.record({
        actor: PURGE_ACTOR,
        action: "purge",
        subjectType: "pulse_response",
        subjectId: response.id,
      });
      purgedResponses += 1;
    } catch {
      failed += 1;
    }
  }

  const dueAlerts = await deps.staffAlertStore.listPastPurgeAfter(now);
  let purgedAlerts = 0;
  for (const alert of dueAlerts) {
    try {
      await deps.staffAlertStore.deleteById(alert.id);
      await deps.piiAccessAudit.record({
        actor: PURGE_ACTOR,
        action: "purge",
        subjectType: "staff_alert",
        subjectId: alert.id,
      });
      purgedAlerts += 1;
    } catch {
      failed += 1;
    }
  }

  return { purgedResponses, purgedAlerts, failed };
}

/** Registers the pulse purge job on `queueClient`'s worker process (task 12.3). */
export async function registerPulsePurgeJob(queueClient: QueueClient, deps: PulsePurgeJobDeps): Promise<void> {
  await queueClient.createQueue(PULSE_PURGE_QUEUE, PULSE_PURGE_RETRY_POLICY);
  await queueClient.work(PULSE_PURGE_QUEUE, async () => {
    await runPulsePurgeJob(deps);
  });
}
