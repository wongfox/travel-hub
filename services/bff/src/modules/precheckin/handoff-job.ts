import { decryptEnvelope } from "../../infra/crypto/envelope-encryption.js";
import type { KeyManagementPort } from "../../infra/crypto/key-management-port.js";
import type { PiiAccessAuditPort } from "../../infra/audit/pii-access-audit.js";
import type { QueueClient, QueueRetryPolicy } from "../../infra/queue/queue-client.js";
import { tightenPurgeAfter, type RetentionConfig } from "./retention.js";
import {
  AlreadyHandedOffError,
  type PrecheckinDocumentStorePort,
  type PrecheckinHandoffPort,
  type PrecheckinSubmissionRecord,
  type PrecheckinSubmissionStore,
  type StoredPrecheckinImage,
} from "./ports.js";

const HANDOFF_ACTOR = "worker:precheckin-handoff-job";

/** Worker queue this job registers on (task 8.5); triggered on a daily cadence by the deployment's own scheduler (Phase 13's scope — out of this task). */
export const PRECHECKIN_HANDOFF_QUEUE = "precheckin-handoff";
export const PRECHECKIN_HANDOFF_RETRY_POLICY: QueueRetryPolicy = { retryLimit: 3, retryBackoffSeconds: 30 };

export interface HandoffJobDeps {
  submissionStore: Pick<PrecheckinSubmissionStore, "listPendingHandoff" | "markHandedOff">;
  documentStore: Pick<PrecheckinDocumentStorePort, "get">;
  kms: KeyManagementPort;
  keyId: string;
  handoffPort: PrecheckinHandoffPort;
  piiAccessAudit: PiiAccessAuditPort;
  retention: RetentionConfig;
  /** Injectable clock for deterministic tests; defaults to `Date.now`. */
  now?: () => Date;
}

export interface HandoffJobResult {
  processed: number;
  handedOff: number;
  failed: number;
}

interface ImageEntry {
  role: "photo" | "id_front" | "id_back";
  image: StoredPrecheckinImage;
}

function imageEntriesFor(submission: PrecheckinSubmissionRecord): ImageEntry[] {
  const entries: ImageEntry[] = [
    { role: "photo", image: submission.photo },
    { role: "id_front", image: submission.idFront },
  ];
  if (submission.idBack) {
    entries.push({ role: "id_back", image: submission.idBack });
  }
  return entries;
}

async function decryptAndAudit(
  entry: ImageEntry,
  submission: PrecheckinSubmissionRecord,
  deps: HandoffJobDeps,
): Promise<{ role: "photo" | "id_front" | "id_back"; contentType: string; bytes: Buffer }> {
  const plaintext = await decryptEnvelope(
    {
      ciphertext: await deps.documentStore.get(entry.image.objectKey),
      iv: entry.image.iv,
      authTag: entry.image.authTag,
      wrappedDataKey: entry.image.wrappedDataKey,
    },
    deps.kms,
    deps.keyId,
    HANDOFF_ACTOR,
  );
  await deps.piiAccessAudit.record({
    actor: HANDOFF_ACTOR,
    action: "unwrap",
    subjectType: "precheckin_submission",
    subjectId: submission.id,
  });
  // Image bytes are re-encoded JPEG at capture time (task 8.2/design Decision
  // 15); the handoff package does not need the original multipart
  // content-type, which this layer never persisted.
  return { role: entry.role, contentType: "image/jpeg", bytes: plaintext };
}

async function handOffOne(submission: PrecheckinSubmissionRecord, now: Date, deps: HandoffJobDeps): Promise<void> {
  const images = await Promise.all(imageEntriesFor(submission).map((entry) => decryptAndAudit(entry, submission, deps)));

  await deps.handoffPort.deliver({
    submissionId: submission.id,
    reservationRef: submission.reservationRef,
    passengerRef: submission.passengerRef,
    docType: submission.docType,
    images,
    // Stable across retries (ports.ts): protects against re-delivering
    // already-handed-off PII if markHandedOff below fails after this
    // deliver() already succeeded.
    idempotencyKey: submission.id,
  });

  await deps.piiAccessAudit.record({
    actor: HANDOFF_ACTOR,
    action: "handoff",
    subjectType: "precheckin_submission",
    subjectId: submission.id,
  });

  const handedOffAt = now.toISOString();
  const candidatePurgeAfter = new Date(now.getTime() + deps.retention.handoffGraceMs).toISOString();
  await deps.submissionStore.markHandedOff(
    submission.id,
    handedOffAt,
    tightenPurgeAfter(submission.purgeAfter, candidatePurgeAfter),
  );
}

/**
 * `HandoffJob` (task 8.5): delivers every pending (`status === "received"`)
 * submission's decrypted images to `PrecheckinHandoffPort` (the stub, until
 * the downstream consumer is defined — design's open item), then marks it
 * `"handed_off"` and tightens `purge_after` via `handed_off_at +
 * HANDOFF_GRACE`. Only this job (the `worker` role, per the design's
 * access-control rule) ever unwraps/decrypts pre check-in images; a delivery
 * failure leaves the submission's status unchanged so a later run retries it,
 * and one submission's failure never blocks another's.
 */
export async function runHandoffJob(deps: HandoffJobDeps): Promise<HandoffJobResult> {
  const now = deps.now ? deps.now() : new Date();
  const pending = await deps.submissionStore.listPendingHandoff();

  let handedOff = 0;
  let failed = 0;
  for (const submission of pending) {
    try {
      await handOffOne(submission, now, deps);
      handedOff += 1;
    } catch (error) {
      // An overlapping run won the compare-and-swap on `status = 'received'`: the downstream
      // delivery is idempotent on `submission.id`, so this run simply skips (neither a
      // handoff nor a failure) and the winner's handedOffAt/purgeAfter stay intact.
      if (!(error instanceof AlreadyHandedOffError)) failed += 1;
    }
  }

  return { processed: pending.length, handedOff, failed };
}

/**
 * Registers the `HandoffJob` on `queueClient`'s worker process (task 8.5's
 * "wired to this module"): creates the `precheckin-handoff` queue and its
 * handler, which runs `runHandoffJob` against `deps` whenever the queue is
 * triggered (`sendIdempotent` with a fixed natural key, so only one scan is
 * ever in flight at a time — the same convention as `sample-job.ts`).
 */
export async function registerHandoffJob(queueClient: QueueClient, deps: HandoffJobDeps): Promise<void> {
  await queueClient.createQueue(PRECHECKIN_HANDOFF_QUEUE, PRECHECKIN_HANDOFF_RETRY_POLICY);
  await queueClient.work(PRECHECKIN_HANDOFF_QUEUE, async () => {
    await runHandoffJob(deps);
  });
}
