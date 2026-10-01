import { randomUUID } from "node:crypto";
import type { DocumentType } from "contracts";
import { encryptEnvelope } from "../../infra/crypto/envelope-encryption.js";
import type { KeyManagementPort } from "../../infra/crypto/key-management-port.js";
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
  documentStore: PrecheckinDocumentStorePort;
  kms: KeyManagementPort;
  keyId: string;
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

  const photo = await encryptAndStore(photoInput, input.reservationRef, input.passengerRef, deps);
  const idFront = await encryptAndStore(idFrontInput, input.reservationRef, input.passengerRef, deps);
  const idBack = idBackInput ? await encryptAndStore(idBackInput, input.reservationRef, input.passengerRef, deps) : null;

  return deps.submissionStore.create({
    reservationRef: input.reservationRef,
    passengerRef: input.passengerRef,
    docType: input.docType,
    consentRecordId: input.consentRecordId,
    photo,
    idFront,
    idBack,
  });
}
