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
  delete(key: string): Promise<void>;
}

/** One image's stored encryption envelope + object key, embedded in a submission record. */
export interface StoredPrecheckinImage {
  objectKey: string;
  wrappedDataKey: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

/** Persisted shape of one `precheckin_submission` row (design Data Model), simplified for the in-memory port. */
export interface PrecheckinSubmissionRecord {
  id: string;
  reservationRef: string;
  passengerRef: string;
  docType: DocumentType;
  consentRecordId: string;
  photo: StoredPrecheckinImage;
  idFront: StoredPrecheckinImage;
  idBack: StoredPrecheckinImage | null;
  submittedAt: string;
}

export interface CreatePrecheckinSubmissionInput {
  reservationRef: string;
  passengerRef: string;
  docType: DocumentType;
  consentRecordId: string;
  photo: StoredPrecheckinImage;
  idFront: StoredPrecheckinImage;
  idBack: StoredPrecheckinImage | null;
}

/**
 * Same in-memory-port convention as `ConsentStore`/`AccessLinkStore`: a small
 * port so the submission use case (task 8.3) and status projection (task
 * 8.4) are unit testable deterministically without a live Postgres. A
 * Drizzle-backed adapter over the `precheckin_submission` table lands once a
 * consumer needs it against a live database.
 */
export interface PrecheckinSubmissionStore {
  /** `null` when this passenger has not yet completed a submission ("none" status). */
  findByPassenger(reservationRef: string, passengerRef: string): Promise<PrecheckinSubmissionRecord | null>;
  /**
   * Persists a submission. Callers MUST call `findByPassenger` first and
   * refuse to call `create` when one already exists (the `already_submitted`
   * guard lives in the use case, not here, so this port stays a dumb store).
   */
  create(input: CreatePrecheckinSubmissionInput): Promise<PrecheckinSubmissionRecord>;
}

/** Thrown by the submit use case when a submission already exists for this passenger ("already_submitted" error code). */
export class AlreadySubmittedError extends Error {
  constructor(reservationRef: string, passengerRef: string) {
    super(`Pre check-in already submitted for reservation "${reservationRef}", passenger "${passengerRef}"`);
    this.name = "AlreadySubmittedError";
  }
}

/** Thrown when a route's `:passengerOrdinal` does not resolve to a passenger within the session's own scope. */
export class PassengerNotInScopeError extends Error {
  constructor(ordinal: number) {
    super(`Passenger ordinal ${ordinal} is not in this session's scope`);
    this.name = "PassengerNotInScopeError";
  }
}
