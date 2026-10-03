import { randomUUID } from "node:crypto";
import type { ConsentPurpose } from "contracts";

/**
 * Persisted shape of one `consent_record` row (design Data Model /
 * `services/bff/src/infra/db/schema.ts`, task 3.3). Same in-memory-port
 * convention as `AccessLinkStore`/`SessionStore` (tasks 5.2/5.3): a small
 * port so the consent use cases (task 8.1) are unit testable deterministically
 * without a live Postgres. A Drizzle-backed adapter over the existing
 * `consentRecord` table lands once a consumer needs it against a live
 * database.
 *
 * `passengerRef` is always `null` for now: `RecordConsentRequestSchema`
 * (task 2.4, frozen) carries no passenger identifier, consistent with the
 * spec's own "whether pre check-in is required per passenger or per
 * booking" being named TBD. The column stays nullable so a later work unit
 * can scope a purpose per passenger without a schema change.
 */
export interface ConsentRecordEntry {
  id: string;
  linkId: string;
  reservationRef: string;
  passengerRef: string | null;
  purpose: ConsentPurpose;
  textVersion: string;
  granted: boolean;
  recordedAt: string;
}

export interface RecordConsentInput {
  linkId: string;
  reservationRef: string;
  passengerRef: string | null;
  purpose: ConsentPurpose;
  textVersion: string;
  granted: boolean;
}

export interface ConsentStore {
  /**
   * Appends a new consent record. Never updates or deletes an existing row
   * (design Data Model: "append-only; latest per purpose wins") — a
   * withdrawal is a new row with `granted: false`, exactly like
   * `session`/`access_link`'s own append/revoke conventions elsewhere in
   * this module set.
   */
  record(input: RecordConsentInput): Promise<ConsentRecordEntry>;
  /**
   * The most recently recorded consent for `(reservationRef, passengerRef,
   * purpose)`, or `null` if none exists yet. "Latest wins" is resolved here
   * — callers never need to sort/filter the full history themselves.
   */
  findLatest(
    reservationRef: string,
    passengerRef: string | null,
    purpose: ConsentPurpose,
  ): Promise<ConsentRecordEntry | null>;
}

export function createInMemoryConsentStore(): ConsentStore {
  const records: ConsentRecordEntry[] = [];

  return {
    async record(input: RecordConsentInput): Promise<ConsentRecordEntry> {
      const entry: ConsentRecordEntry = {
        id: randomUUID(),
        linkId: input.linkId,
        reservationRef: input.reservationRef,
        passengerRef: input.passengerRef,
        purpose: input.purpose,
        textVersion: input.textVersion,
        granted: input.granted,
        recordedAt: new Date().toISOString(),
      };
      records.push(entry);
      return entry;
    },

    async findLatest(
      reservationRef: string,
      passengerRef: string | null,
      purpose: ConsentPurpose,
    ): Promise<ConsentRecordEntry | null> {
      let latest: ConsentRecordEntry | null = null;
      for (const record of records) {
        if (
          record.reservationRef === reservationRef &&
          record.passengerRef === passengerRef &&
          record.purpose === purpose
        ) {
          if (!latest || new Date(record.recordedAt).getTime() >= new Date(latest.recordedAt).getTime()) {
            latest = record;
          }
        }
      }
      return latest;
    },
  };
}
