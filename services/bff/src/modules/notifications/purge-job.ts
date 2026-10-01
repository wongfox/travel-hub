import type { PiiAccessAuditPort } from "../../infra/audit/pii-access-audit.js";
import type { QueueClient, QueueRetryPolicy } from "../../infra/queue/queue-client.js";
import type { PushSubscriptionStore } from "./ports.js";

const PURGE_ACTOR = "worker:push-subscription-purge-job";

/** Worker queue this job registers on (task 12.3), following `registerPurgeJob`'s (precheckin's) exact convention; triggered on the deployment's own scheduler cadence (Phase 13's scope — out of this task, same as every other purge job in this codebase). */
export const PUSH_SUBSCRIPTION_PURGE_QUEUE = "push-subscription-purge";
export const PUSH_SUBSCRIPTION_PURGE_RETRY_POLICY: QueueRetryPolicy = { retryLimit: 3, retryBackoffSeconds: 30 };

export interface PushSubscriptionPurgeJobDeps {
  subscriptionStore: Pick<PushSubscriptionStore, "listExpired" | "deleteById">;
  piiAccessAudit: PiiAccessAuditPort;
  /** Injectable clock for deterministic tests; defaults to `Date.now`. */
  now?: () => Date;
}

export interface PushSubscriptionPurgeJobResult {
  purged: number;
  failed: number;
}

/**
 * `push-notifications` retention/purge scheduler (task 12.3, design Decision
 * 11: "`expires_at` = link expiry... deleted on 404/410"): deletes every
 * subscription whose `expiresAt` has already elapsed — this is a REAL
 * scheduled delete, not just a read-time filter (`findActiveByReservation`
 * already excludes expired rows from reads; this job is what actually
 * removes them from storage). One subscription's deletion failure is
 * isolated by a real try/catch per item (same convention as
 * `runHandoffJob`/`runStaffAlertDispatchJob`) and never blocks another's
 * purge. Every purge writes a `pii_access_audit` entry (task 12.3's "any
 * remaining unwrap/access paths" — a push subscription's endpoint/auth
 * secret is PII-adjacent per the design's own Security section, so its
 * deletion is audited exactly like pre check-in's purge job audits its own
 * deletions).
 */
export async function runPushSubscriptionPurgeJob(
  deps: PushSubscriptionPurgeJobDeps,
): Promise<PushSubscriptionPurgeJobResult> {
  const now = deps.now ? deps.now() : new Date();
  const expired = await deps.subscriptionStore.listExpired(now);

  let purged = 0;
  let failed = 0;
  for (const subscription of expired) {
    try {
      await deps.subscriptionStore.deleteById(subscription.id);
      await deps.piiAccessAudit.record({
        actor: PURGE_ACTOR,
        action: "purge",
        subjectType: "push_subscription",
        subjectId: subscription.id,
      });
      purged += 1;
    } catch {
      failed += 1;
    }
  }

  return { purged, failed };
}

/** Registers the push-subscription purge job on `queueClient`'s worker process (task 12.3). */
export async function registerPushSubscriptionPurgeJob(
  queueClient: QueueClient,
  deps: PushSubscriptionPurgeJobDeps,
): Promise<void> {
  await queueClient.createQueue(PUSH_SUBSCRIPTION_PURGE_QUEUE, PUSH_SUBSCRIPTION_PURGE_RETRY_POLICY);
  await queueClient.work(PUSH_SUBSCRIPTION_PURGE_QUEUE, async () => {
    await runPushSubscriptionPurgeJob(deps);
  });
}
