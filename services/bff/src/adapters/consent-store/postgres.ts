import { and, desc, eq, isNull } from "drizzle-orm";
import type { ConsentPurpose } from "contracts";
import type { Db } from "../../infra/db/client.js";
import { consentRecord } from "../../infra/db/schema.js";
import type { ConsentRecordEntry, ConsentStore, RecordConsentInput } from "../../modules/privacy/consent-store.js";

type ConsentRow = typeof consentRecord.$inferSelect;

function toEntry(row: ConsentRow): ConsentRecordEntry {
  return {
    id: row.id,
    linkId: row.linkId,
    reservationRef: row.reservationRef,
    passengerRef: row.passengerRef,
    purpose: row.purpose,
    textVersion: row.textVersion,
    granted: row.granted,
    recordedAt: row.recordedAt.toISOString(),
  };
}

/**
 * Postgres/Drizzle `ConsentStore` over `consent_record`, shared by `bff-api`
 * (records) and `bff-worker` (the analytics forward job re-checks consent via
 * `listLatestByPurpose`) through the same `DATABASE_URL`. Append-only: the
 * only write is an INSERT; "latest wins" is resolved by the identity `seq`
 * column (a total order, unlike `recorded_at` which can tie within one tick).
 */
export function createPostgresConsentStore(db: Db, now: () => Date = () => new Date()): ConsentStore {
  return {
    async record(input: RecordConsentInput): Promise<ConsentRecordEntry> {
      const [row] = await db
        .insert(consentRecord)
        .values({
          linkId: input.linkId,
          reservationRef: input.reservationRef,
          passengerRef: input.passengerRef,
          purpose: input.purpose,
          textVersion: input.textVersion,
          granted: input.granted,
          recordedAt: now(),
        })
        .returning();
      if (!row) throw new Error("consent_record insert returned no row");
      return toEntry(row);
    },

    async findLatest(reservationRef, passengerRef, purpose: ConsentPurpose) {
      const [row] = await db
        .select()
        .from(consentRecord)
        .where(
          and(
            eq(consentRecord.reservationRef, reservationRef),
            passengerRef === null ? isNull(consentRecord.passengerRef) : eq(consentRecord.passengerRef, passengerRef),
            eq(consentRecord.purpose, purpose),
          ),
        )
        .orderBy(desc(consentRecord.seq))
        .limit(1);
      return row ? toEntry(row) : null;
    },

    async listLatestByPurpose(purpose: ConsentPurpose) {
      const rows = await db
        .selectDistinctOn([consentRecord.reservationRef])
        .from(consentRecord)
        .where(and(eq(consentRecord.purpose, purpose), isNull(consentRecord.passengerRef)))
        .orderBy(consentRecord.reservationRef, desc(consentRecord.seq));
      return rows.map(toEntry);
    },
  };
}
