import { randomUUID } from "node:crypto";
import type {
  CreatePrecheckinSubmissionInput,
  PrecheckinSubmissionRecord,
  PrecheckinSubmissionStore,
  StoredPrecheckinImage,
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
export function createInMemorySubmissionStore(): PrecheckinSubmissionStore {
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
        submittedAt: new Date().toISOString(),
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
      record.status = "handed_off";
      record.handedOffAt = handedOffAt;
      record.purgeAfter = purgeAfter;
      return record;
    },

    async listPastPurgeAfter(asOf: Date): Promise<PrecheckinSubmissionRecord[]> {
      return records.filter(
        (record) => record.status !== "purged" && new Date(record.purgeAfter).getTime() <= asOf.getTime(),
      );
    },

    async markPurged(id: string, purgedAt: string): Promise<PrecheckinSubmissionRecord> {
      const record = requireById(id);
      record.status = "purged";
      record.purgedAt = purgedAt;
      record.photo = shred(record.photo);
      record.idFront = shred(record.idFront);
      record.idBack = record.idBack ? shred(record.idBack) : null;
      return record;
    },
  };
}
