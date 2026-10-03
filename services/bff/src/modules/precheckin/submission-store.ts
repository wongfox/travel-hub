import { randomUUID } from "node:crypto";
import { tightenPurgeAfter } from "./retention.js";
import {
  AlreadySubmittedError,
  type CreatePrecheckinSubmissionInput,
  type PrecheckinSubmissionRecord,
  type PrecheckinSubmissionStore,
  type StoredPrecheckinImage,
} from "./ports.js";

function shred(image: StoredPrecheckinImage): StoredPrecheckinImage {
  // Crypto-shredding (design's pre check-in Security section, "nulls
  // wrapped_dek"): the object key is kept as a historical reference (the
  // underlying ciphertext object itself is deleted by the caller via
  // `PrecheckinDocumentStorePort.delete`, not here), but the key material is
  // zeroed so the ciphertext — even if it somehow survived — can never be
  // decrypted again.
  return { ...image, wrappedDataKey: Buffer.alloc(0), iv: Buffer.alloc(0), authTag: Buffer.alloc(0) };
}

/**
 * Same in-memory-port convention as `ConsentStore`/`AccessLinkStore` (see
 * `ports.ts`'s doc comment on `PrecheckinSubmissionStore`).
 */
export function createInMemorySubmissionStore(now: () => Date = () => new Date()): PrecheckinSubmissionStore {
  const records: PrecheckinSubmissionRecord[] = [];

  function requireById(id: string): PrecheckinSubmissionRecord {
    const record = records.find((candidate) => candidate.id === id);
    if (!record) {
      throw new Error(`No precheckin_submission found with id "${id}"`);
    }
    return record;
  }

  return {
    async findByPassenger(reservationRef: string, passengerRef: string): Promise<PrecheckinSubmissionRecord | null> {
      return (
        records.find(
          (record) => record.reservationRef === reservationRef && record.passengerRef === passengerRef,
        ) ?? null
      );
    },

    async create(input: CreatePrecheckinSubmissionInput): Promise<PrecheckinSubmissionRecord> {
      // One submission per passenger (the `already_submitted` guarantee), enforced here
      // synchronously so it also holds for concurrent callers, like the Postgres UNIQUE.
      if (records.some((r) => r.reservationRef === input.reservationRef && r.passengerRef === input.passengerRef)) {
        throw new AlreadySubmittedError(input.reservationRef, input.passengerRef);
      }
      const record: PrecheckinSubmissionRecord = {
        id: randomUUID(),
        reservationRef: input.reservationRef,
        passengerRef: input.passengerRef,
        docType: input.docType,
        consentRecordId: input.consentRecordId,
        status: "received",
        photo: input.photo,
        idFront: input.idFront,
        idBack: input.idBack,
        submittedAt: now().toISOString(),
        handedOffAt: null,
        purgeAfter: input.purgeAfter,
        purgedAt: null,
      };
      records.push(record);
      return record;
    },

    async listPendingHandoff(): Promise<PrecheckinSubmissionRecord[]> {
      return records.filter((record) => record.status === "received");
    },

    async markHandedOff(id: string, handedOffAt: string, purgeAfter: string): Promise<PrecheckinSubmissionRecord> {
      const record = requireById(id);
      if (record.status === "purged") {
        throw new Error(`precheckin_submission "${id}" is already purged and can no longer be handed off`);
      }
      record.status = "handed_off";
      record.handedOffAt = handedOffAt;
      record.purgeAfter = tightenPurgeAfter(record.purgeAfter, purgeAfter);
      return record;
    },

    async listPastPurgeAfter(asOf: Date): Promise<PrecheckinSubmissionRecord[]> {
      return records.filter(
        (record) => record.status !== "purged" && new Date(record.purgeAfter).getTime() <= asOf.getTime(),
      );
    },

    async markPurged(id: string, purgedAt: string): Promise<PrecheckinSubmissionRecord> {
      const record = requireById(id);
      // Idempotent: a retried purge (e.g. a crash between the object delete and this call)
      // keeps the first purgedAt; the key material is already zeroed.
      if (record.status === "purged") return record;
      record.status = "purged";
      record.purgedAt = purgedAt;
      record.photo = shred(record.photo);
      record.idFront = shred(record.idFront);
      record.idBack = record.idBack ? shred(record.idBack) : null;
      return record;
    },
  };
}
