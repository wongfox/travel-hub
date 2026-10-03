import { randomUUID } from "node:crypto";
import type { CreatePrecheckinSubmissionInput, PrecheckinSubmissionRecord, PrecheckinSubmissionStore } from "./ports.js";

/**
 * Same in-memory-port convention as `ConsentStore`/`AccessLinkStore` (see
 * `ports.ts`'s doc comment on `PrecheckinSubmissionStore`).
 */
export function createInMemorySubmissionStore(): PrecheckinSubmissionStore {
  const records: PrecheckinSubmissionRecord[] = [];

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
        photo: input.photo,
        idFront: input.idFront,
        idBack: input.idBack,
        submittedAt: new Date().toISOString(),
      };
      records.push(record);
      return record;
    },
  };
}
