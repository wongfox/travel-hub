import type { PiiAccessAuditPort } from "../../infra/audit/pii-access-audit.js";
import type { QueueClient, QueueRetryPolicy } from "../../infra/queue/queue-client.js";
import type { PrecheckinDocumentStorePort, PrecheckinSubmissionRecord, PrecheckinSubmissionStore } from "./ports.js";

const PURGE_ACTOR = "worker:precheckin-purge-job";

/** Worker queue this job registers on (task 8.5); the "daily" cadence is the deployment's own scheduler trigger (Phase 13's scope — out of this task; this job's body is idempotent regardless of how often it runs). */
export const PRECHECKIN_PURGE_QUEUE = "precheckin-purge";
export const PRECHECKIN_PURGE_RETRY_POLICY: QueueRetryPolicy = { retryLimit: 3, retryBackoffSeconds: 30 };

export interface PurgeJobDeps {
  submissionStore: Pick<PrecheckinSubmissionStore, "listPastPurgeAfter" | "markPurged">;
  documentStore: Pick<PrecheckinDocumentStorePort, "delete">;
  piiAccessAudit: PiiAccessAuditPort;
  /** Injectable clock for deterministic tests; defaults to `Date.now`. */
  now?: () => Date;
}

export interface PurgeJobResult {
  purged: number;
}

function objectKeysOf(submission: PrecheckinSubmissionRecord): string[] {
  const keys = [submission.photo.objectKey, submission.idFront.objectKey];
  if (submission.idBack) keys.push(submission.idBack.objectKey);
  return keys;
}

/**
 * `PurgeJob` (task 8.5, design's pre check-in Security/Retention section):
 * deletes the encrypted objects and crypto-shreds (zeroes the wrapped DEK/
 * IV/auth tag of) every submission whose `purge_after` has elapsed, whether
 * or not it was ever handed off — retention always wins over handoff state,
 * per the design's `purge_after = min(handed_off_at + HANDOFF_GRACE, trip end
 * + PRECHECKIN_RETENTION_DAYS)` formula applying regardless of which half of
 * the `min` wins. Intended to run on a daily cadence (the actual cron/
 * scheduling trigger is a deployment concern, Phase 13's scope — this job's
 * body is independently testable and idempotent regardless of how often it
 * is invoked).
 */
export async function runPurgeJob(deps: PurgeJobDeps): Promise<PurgeJobResult> {
  const now = deps.now ? deps.now() : new Date();
  const due = await deps.submissionStore.listPastPurgeAfter(now);

  for (const submission of due) {
    await Promise.all(objectKeysOf(submission).map((key) => deps.documentStore.delete(key)));
    await deps.piiAccessAudit.record({
      actor: PURGE_ACTOR,
      action: "purge",
      subjectType: "precheckin_submission",
      subjectId: submission.id,
    });
    await deps.submissionStore.markPurged(submission.id, now.toISOString());
  }

  return { purged: due.length };
}

/**
 * Registers the `PurgeJob` on `queueClient`'s worker process (task 8.5's
 * "wired to this module"): creates the `precheckin-purge` queue and its
 * handler, which runs `runPurgeJob` against `deps` whenever the queue is
 * triggered (same `sendIdempotent`-with-a-fixed-key convention as the
 * `HandoffJob` and `sample-job.ts`).
 */
export async function registerPurgeJob(queueClient: QueueClient, deps: PurgeJobDeps): Promise<void> {
  await queueClient.createQueue(PRECHECKIN_PURGE_QUEUE, PRECHECKIN_PURGE_RETRY_POLICY);
  await queueClient.work(PRECHECKIN_PURGE_QUEUE, async () => {
    await runPurgeJob(deps);
  });
}
