import type { DocumentType } from "contracts";
import type { KeyManagementPort } from "../../infra/crypto/key-management-port.js";

// `KeyManagementPort` itself is declared in `infra/crypto` (task 3.5, ahead of
// this module's existence) and re-exported here so callers of this module
// never need to know that historical detail.
export type { KeyManagementPort };

/**
 * `PrecheckinDocumentStorePort` per `sdd/travel-hub-mvp/design-interfaces`:
 * puts/deletes an already-encrypted object (the caller performs envelope
 * encryption before calling `put` — this port never sees plaintext). Modeled
 * exactly like `TicketDocumentPort`'s minimalism: no listing, no metadata,
 * because the `precheckin_submission` record (this module's own store) is
 * the source of truth for which object keys exist.
 */
export interface PrecheckinDocumentStorePort {
  put(key: string, ciphertext: Buffer): Promise<void>;
  /** Retrieves a previously `put` ciphertext. Added for task 8.5's `HandoffJob`, which must read back and decrypt each image before delivery. Throws if `key` does not exist (e.g. already purged). */
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

/**
 * `PrecheckinHandoffPort` per `sdd/travel-hub-mvp/design-interfaces`: delivers
 * one submission's decrypted images to the (still undefined) downstream
 * consumer. The `HandoffJob` (task 8.5) is the only caller — it is the only
 * place plaintext images ever exist outside the browser, per the design's
 * access-control rule that only the `worker` role may decrypt.
 */
export interface PrecheckinHandoffPort {
  deliver(pkg: {
    submissionId: string;
    reservationRef: string;
    passengerRef: string;
    docType: DocumentType;
    images: { role: "photo" | "id_front" | "id_back"; contentType: string; bytes: Buffer }[];
    /**
     * Stable per-submission key (`HandoffJob` passes `submission.id`). A real
     * adapter MUST treat a repeated `idempotencyKey` as a no-op returning the
     * same `handoffRef`: `HandoffJob` persists `handedOffAt` only *after*
     * `deliver` resolves, so a crash or store failure between a successful
     * `deliver` and that persist causes the next run to call `deliver` again
     * for the same submission — without this guarantee that retry would
     * re-deliver already-handed-off PII to the downstream consumer.
     */
    idempotencyKey: string;
  }): Promise<{ handoffRef: string }>;
}

/** One image's stored encryption envelope + object key, embedded in a submission record. */
export interface StoredPrecheckinImage {
  objectKey: string;
  wrappedDataKey: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

/**
 * `precheckin_submission.status` (design Data Model): `"received"` once
 * submitted, `"handed_off"` once the `HandoffJob` (task 8.5) delivers it
 * through `PrecheckinHandoffPort`, `"purged"` once the `PurgeJob` (task 8.5)
 * crypto-shreds it past `purge_after`. Handoff and purge are independent —
 * a submission can be purged before it is ever handed off (retention always
 * wins), so `"purged"` is reachable directly from `"received"` too.
 */
export type PrecheckinSubmissionStatus = "received" | "handed_off" | "purged";

/** Persisted shape of one `precheckin_submission` row (design Data Model), simplified for the in-memory port. */
export interface PrecheckinSubmissionRecord {
  id: string;
  reservationRef: string;
  passengerRef: string;
  docType: DocumentType;
  consentRecordId: string;
  status: PrecheckinSubmissionStatus;
  photo: StoredPrecheckinImage;
  idFront: StoredPrecheckinImage;
  idBack: StoredPrecheckinImage | null;
  submittedAt: string;
  /** Set by the `HandoffJob` (task 8.5) once `PrecheckinHandoffPort.deliver` succeeds; `null` until then. */
  handedOffAt: string | null;
  /**
   * `min(handed_off_at + HANDOFF_GRACE, trip end + PRECHECKIN_RETENTION_DAYS)`
   * (design's pre check-in Security section). Computed at submission time via
   * `retention.ts`'s `computeInitialPurgeAfter` (trip end + retention only,
   * since handoff has not happened yet) and tightened by the `HandoffJob` via
   * `tightenPurgeAfter` once a handoff actually completes.
   */
  purgeAfter: string;
  /** Set by the `PurgeJob` (task 8.5) once this submission is crypto-shredded; `null` until then. */
  purgedAt: string | null;
}

export interface CreatePrecheckinSubmissionInput {
  reservationRef: string;
  passengerRef: string;
  docType: DocumentType;
  consentRecordId: string;
  photo: StoredPrecheckinImage;
  idFront: StoredPrecheckinImage;
  idBack: StoredPrecheckinImage | null;
  /** Computed by the caller (`submitPrecheckin`, task 8.3/8.5) via `retention.ts`'s `computeInitialPurgeAfter`. */
  purgeAfter: string;
}

/**
 * Same in-memory-port convention as `ConsentStore`/`AccessLinkStore`: a small
 * port so the submission use case (task 8.3), status projection (task 8.4),
 * and the handoff/purge jobs (task 8.5) are unit testable deterministically
 * without a live Postgres. A Drizzle-backed adapter over the
 * `precheckin_submission` table lands once a consumer needs it against a
 * live database.
 */
export interface PrecheckinSubmissionStore {
  /** `null` when this passenger has not yet completed a submission ("none" status). */
  findByPassenger(reservationRef: string, passengerRef: string): Promise<PrecheckinSubmissionRecord | null>;
  /**
   * Persists a submission with `status: "received"`. Callers MUST call
   * `findByPassenger` first and refuse to call `create` when one already
   * exists (the `already_submitted` guard lives in the use case, not here,
   * so this port stays a dumb store).
   */
  create(input: CreatePrecheckinSubmissionInput): Promise<PrecheckinSubmissionRecord>;
  /** Every submission still awaiting handoff (`status === "received"`); the `HandoffJob`'s (task 8.5) input set. */
  listPendingHandoff(): Promise<PrecheckinSubmissionRecord[]>;
  /** Compare-and-swap `"received"` -> `"handed_off"`: records `handedOffAt` and tightens `purgeAfter` (never loosens it). Exactly one of several overlapping callers wins; the rest throw `AlreadyHandedOffError` and change nothing. Throws a plain error if `id` is unknown or already purged. */
  markHandedOff(id: string, handedOffAt: string, purgeAfter: string): Promise<PrecheckinSubmissionRecord>;
  /** Every submission whose `purgeAfter` has elapsed as of `asOf` and is not already purged; the `PurgeJob`'s (task 8.5) input set. */
  listPastPurgeAfter(asOf: Date): Promise<PrecheckinSubmissionRecord[]>;
  /** Flips `status` to `"purged"` and records `purgedAt`. Crypto-shredding the image key material itself is this method's responsibility, not the caller's. Idempotent: purging an already-purged submission returns it unchanged (the first `purgedAt` wins). Throws if `id` is unknown. */
  markPurged(id: string, purgedAt: string): Promise<PrecheckinSubmissionRecord>;
}

/** Thrown by the submit use case when a submission already exists for this passenger ("already_submitted" error code). */
export class AlreadySubmittedError extends Error {
  constructor(reservationRef: string, passengerRef: string) {
    super(`Pre check-in already submitted for reservation "${reservationRef}", passenger "${passengerRef}"`);
    this.name = "AlreadySubmittedError";
  }
}

/**
 * Thrown by `markHandedOff` when the submission is already `"handed_off"`: another
 * (overlapping) handoff run won the compare-and-swap on `status = 'received'`. The
 * loser skips cleanly; the winner's `handedOffAt`/`purgeAfter` are left untouched.
 */
export class AlreadyHandedOffError extends Error {
  constructor(id: string) {
    super(`precheckin_submission "${id}" is already handed off`);
    this.name = "AlreadyHandedOffError";
  }
}

/** Thrown when a route's `:passengerOrdinal` does not resolve to a passenger within the session's own scope. */
export class PassengerNotInScopeError extends Error {
  constructor(ordinal: number) {
    super(`Passenger ordinal ${ordinal} is not in this session's scope`);
    this.name = "PassengerNotInScopeError";
  }
}
