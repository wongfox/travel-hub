import type { QueueClient, QueueRetryPolicy } from "../../infra/queue/queue-client.js";
import type { StaffAlertPort, StaffAlertStore } from "./ports.js";
import { scheduleQueueScans } from "../../infra/queue/schedule-queue-scans.js";

/** Worker queue this module registers on (task 11.5), following `registerHandoffJob`/`registerWifiOrderJobs`'s exact `registerXxxJob(queueClient, deps)` convention; triggered on the deployment's own cadence (Phase 13's scope), same as `PrecheckinHandoffPort`'s job. */
export const STAFF_ALERT_DISPATCH_QUEUE = "pulse-staff-alert-dispatch";
export const STAFF_ALERT_DISPATCH_RETRY_POLICY: QueueRetryPolicy = { retryLimit: 3, retryBackoffSeconds: 30 };

export interface DispatchStaffAlertsJobDeps {
  staffAlertStore: Pick<StaffAlertStore, "listPending" | "updateStatus">;
  staffAlertPort: Pick<StaffAlertPort, "send">;
  /** Injectable clock for deterministic tests; defaults to `Date.now`. */
  now?: () => Date;
}

export interface DispatchStaffAlertsJobResult {
  processed: number;
  dispatched: number;
  failed: number;
}

/**
 * D4a dispatch scan (task 11.5, design Decision 12): calls
 * `StaffAlertPort.send` for every `status: "pending"` row and records the
 * outcome. One alert's dispatch failure is isolated by a REAL try/catch
 * around that single item — never lets a thrown error abort the loop and
 * block every other pending alert (the exact defect shape two prior work
 * units' native review found: a doc comment claiming this guarantee without
 * the try/catch actually backing it).
 */
export async function runStaffAlertDispatchJob(deps: DispatchStaffAlertsJobDeps): Promise<DispatchStaffAlertsJobResult> {
  const pending = await deps.staffAlertStore.listPending();
  let dispatched = 0;
  let failed = 0;

  for (const alert of pending) {
    try {
      await deps.staffAlertPort.send(alert.payload, alert.id);
      await deps.staffAlertStore.updateStatus(alert.id, "sent", {
        dispatchedAt: (deps.now ? deps.now() : new Date()).toISOString(),
      });
      dispatched += 1;
    } catch (error) {
      await deps.staffAlertStore.updateStatus(alert.id, "failed", {
        attempts: alert.attempts + 1,
        lastError: error instanceof Error ? error.message : String(error),
      });
      failed += 1;
    }
  }

  return { processed: pending.length, dispatched, failed };
}

/** Registers the D4a dispatch job on `queueClient`'s worker process (task 11.5). */
export async function registerStaffAlertDispatchJob(
  queueClient: QueueClient,
  deps: DispatchStaffAlertsJobDeps,
): Promise<void> {
  await queueClient.createQueue(STAFF_ALERT_DISPATCH_QUEUE, STAFF_ALERT_DISPATCH_RETRY_POLICY);
  await queueClient.work(STAFF_ALERT_DISPATCH_QUEUE, async () => {
    await runStaffAlertDispatchJob(deps);
  });
}

/** Default cadence of the staff-alert dispatch scan (60s); overridden by the env-driven interval in `main-worker.ts`. */
export const STAFF_ALERT_DISPATCH_INTERVAL_MS = 60_000;

/**
 * Periodically enqueues the staff-alert dispatch scan on the worker process (nothing else does).
 * Delegates to `scheduleQueueScans`: idempotent natural key, logged send
 * failures retried next tick, returns a stop function.
 */
export function scheduleStaffAlertDispatch(
  queueClient: Pick<QueueClient, "sendIdempotent">,
  options: { intervalMs?: number } = {},
): () => void {
  return scheduleQueueScans(queueClient, [STAFF_ALERT_DISPATCH_QUEUE], { intervalMs: options.intervalMs ?? STAFF_ALERT_DISPATCH_INTERVAL_MS });
}
