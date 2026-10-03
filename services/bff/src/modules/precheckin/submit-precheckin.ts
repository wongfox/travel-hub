import { randomUUID } from "node:crypto";
import type { DocumentType } from "contracts";
import { encryptEnvelope } from "../../infra/crypto/envelope-encryption.js";
import type { KeyManagementPort } from "../../infra/crypto/key-management-port.js";
import { computeInitialPurgeAfter, type RetentionConfig } from "./retention.js";
import {
  AlreadySubmittedError,
  type PrecheckinDocumentStorePort,
  type PrecheckinSubmissionRecord,
  type PrecheckinSubmissionStore,
  type StoredPrecheckinImage,
} from "./ports.js";

export type PrecheckinImageRole = "photo" | "id_front" | "id_back";

export interface SubmitPrecheckinImageInput {
  role: PrecheckinImageRole;
  contentType: string;
  bytes: Buffer;
}

export interface SubmitPrecheckinInput {
  reservationRef: string;
  passengerRef: string;
  docType: DocumentType;
  consentRecordId: string;
  /** MUST include exactly one "photo" and one "id_front"; "id_back" is optional (design Data Model). */
  images: SubmitPrecheckinImageInput[];
}

export interface SubmitPrecheckinDeps {
  submissionStore: Pick<PrecheckinSubmissionStore, "findByPassenger" | "create">;
  documentStore: Pick<PrecheckinDocumentStorePort, "put" | "delete">;
  kms: KeyManagementPort;
  keyId: string;
  /**
   * Latest leg arrival across the reservation (task 8.5's `resolveTripEndLocal`),
   * used only to compute the submission's initial `purgeAfter` — this use
   * case never reads `SirBookingPort` itself, so the caller (the HTTP route)
   * must resolve it first.
   */
  tripEndLocal: string;
  /** `PRECHECKIN_RETENTION_DAYS`/`PRECHECKIN_HANDOFF_GRACE_DAYS`-derived config (task 8.5's `retention.ts`). */
  retention: RetentionConfig;
}

async function encryptAndStore(
  image: SubmitPrecheckinImageInput,
  reservationRef: string,
  passengerRef: string,
  deps: SubmitPrecheckinDeps,
): Promise<StoredPrecheckinImage> {
  const envelope = await encryptEnvelope(image.bytes, deps.kms, deps.keyId);
  const objectKey = `precheckin/${reservationRef}/${passengerRef}/${image.role}/${randomUUID()}`;
  await deps.documentStore.put(objectKey, envelope.ciphertext);
  return {
    objectKey,
    wrappedDataKey: envelope.wrappedDataKey,
    iv: envelope.iv,
    authTag: envelope.authTag,
  };
}

/**
 * `POST /api/precheckin/:passengerOrdinal` use case (task 8.3): per design's
 * pre check-in Security section, each image gets its own fresh DEK (a unique
 * `encryptEnvelope` call per image — never one DEK shared across images) and
 * a unique IV, with the wrapped DEK persisted only in the submission record,
 * never the plaintext key.
 *
 * "Submission failure preserves passenger progress" (spec `pre-check-in`): if
 * any image's encryption or storage throws, this function rejects WITHOUT
 * calling `submissionStore.create`, so a retry naturally is not blocked by
 * `AlreadySubmittedError` and does not require re-consenting (consent is
 * verified by the HTTP layer before this use case is ever invoked, not
 * re-checked per attempt here).
 */
export async function submitPrecheckin(
  input: SubmitPrecheckinInput,
  deps: SubmitPrecheckinDeps,
): Promise<PrecheckinSubmissionRecord> {
  const existing = await deps.submissionStore.findByPassenger(input.reservationRef, input.passengerRef);
  if (existing) {
    throw new AlreadySubmittedError(input.reservationRef, input.passengerRef);
  }

  const photoInput = input.images.find((image) => image.role === "photo");
  const idFrontInput = input.images.find((image) => image.role === "id_front");
  const idBackInput = input.images.find((image) => image.role === "id_back");
  if (!photoInput || !idFrontInput) {
    throw new Error("submitPrecheckin requires at least a 'photo' and an 'id_front' image");
  }

  // Tracks every image whose ciphertext has already been persisted in this
  // call, so a later image's failure can clean up the earlier ones rather
  // than leaving orphaned, untrackable encrypted objects in the document
  // store (no submission record is ever created on this path, so nothing
  // else would ever reference — or be able to purge — those objects).
  const stored: StoredPrecheckinImage[] = [];
  let photo: StoredPrecheckinImage;
  let idFront: StoredPrecheckinImage;
  let idBack: StoredPrecheckinImage | null;
  try {
    photo = await encryptAndStore(photoInput, input.reservationRef, input.passengerRef, deps);
    stored.push(photo);
    idFront = await encryptAndStore(idFrontInput, input.reservationRef, input.passengerRef, deps);
    stored.push(idFront);
    idBack = idBackInput ? await encryptAndStore(idBackInput, input.reservationRef, input.passengerRef, deps) : null;
    if (idBack) stored.push(idBack);
  } catch (error) {
    await Promise.allSettled(stored.map((image) => deps.documentStore.delete(image.objectKey)));
    throw error;
  }

  return deps.submissionStore.create({
    reservationRef: input.reservationRef,
    passengerRef: input.passengerRef,
    docType: input.docType,
    consentRecordId: input.consentRecordId,
    photo,
    idFront,
    idBack,
    // Task 8.5: `trip end + PRECHECKIN_RETENTION_DAYS` baseline (`handed_off_at`
    // is unknown yet, so the `HandoffJob` tightens this once a handoff completes).
    purgeAfter: computeInitialPurgeAfter(deps.tripEndLocal, deps.retention),
  });
}
