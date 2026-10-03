import { and, asc, eq, lte, ne, sql } from "drizzle-orm";
import type { DocumentType } from "contracts";
import type { Db } from "../../infra/db/client.js";
import { precheckinSubmission } from "../../infra/db/schema.js";
import {
  AlreadySubmittedError,
  type CreatePrecheckinSubmissionInput,
  type PrecheckinSubmissionRecord,
  type PrecheckinSubmissionStore,
  type StoredPrecheckinImage,
} from "../../modules/precheckin/ports.js";

type SubmissionRow = typeof precheckinSubmission.$inferSelect;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function unknownSubmission(id: string): Error {
  return new Error(`No precheckin_submission found with id "${id}"`);
}

function toIdBack(row: SubmissionRow): StoredPrecheckinImage | null {
  if (row.idBackObjectKey === null || row.idBackWrappedDataKey === null || row.idBackIv === null || row.idBackAuthTag === null) {
    return null;
  }
  return {
    objectKey: row.idBackObjectKey,
    wrappedDataKey: row.idBackWrappedDataKey,
    iv: row.idBackIv,
    authTag: row.idBackAuthTag,
  };
}

function toRecord(row: SubmissionRow): PrecheckinSubmissionRecord {
  return {
    id: row.id,
    reservationRef: row.reservationRef,
    passengerRef: row.passengerRef,
    docType: row.docType as DocumentType,
    consentRecordId: row.consentRecordId,
    status: row.status,
    photo: {
      objectKey: row.photoObjectKey,
      wrappedDataKey: row.photoWrappedDataKey,
      iv: row.photoIv,
      authTag: row.photoAuthTag,
    },
    idFront: {
      objectKey: row.idFrontObjectKey,
      wrappedDataKey: row.idFrontWrappedDataKey,
      iv: row.idFrontIv,
      authTag: row.idFrontAuthTag,
    },
    idBack: toIdBack(row),
    submittedAt: row.submittedAt.toISOString(),
    handedOffAt: row.handedOffAt ? row.handedOffAt.toISOString() : null,
    purgeAfter: row.purgeAfter.toISOString(),
    purgedAt: row.purgedAt ? row.purgedAt.toISOString() : null,
  };
}

/**
 * Postgres/Drizzle `PrecheckinSubmissionStore` over `precheckin_submission`,
 * shared by `bff-api` (create, status lookup) and `bff-worker` (handoff and
 * purge scans) through the same `DATABASE_URL`.
 *
 * SENSITIVE: the table holds metadata and encrypted-document references only
 * (object keys + envelope-encryption material); this adapter never receives
 * image bytes or plaintext, and never logs or throws submission contents
 * (errors carry the id or the passenger refs only).
 *
 * - `create` is one `INSERT ... ON CONFLICT DO NOTHING RETURNING` over
 *   `UNIQUE(reservation_ref, passenger_ref)`: concurrent submissions cannot both
 *   win and the loser gets `AlreadySubmittedError` without touching the winner.
 * - `markHandedOff` only ever tightens `purge_after` (`LEAST`) and refuses a
 *   purged submission (its key material is gone).
 * - `markPurged` crypto-shreds in the same UPDATE that flips the status (key
 *   material zeroed, object keys kept); a CHECK enforces that invariant too. It is
 *   guarded by `status <> 'purged'`, so a retried purge is a no-op that returns the
 *   stored row: the first `purged_at` wins.
 */
export function createPostgresPrecheckinSubmissionStore(
  db: Db,
  now: () => Date = () => new Date(),
): PrecheckinSubmissionStore {
  return {
    async findByPassenger(reservationRef: string, passengerRef: string): Promise<PrecheckinSubmissionRecord | null> {
      const rows = await db
        .select()
        .from(precheckinSubmission)
        .where(
          and(
            eq(precheckinSubmission.reservationRef, reservationRef),
            eq(precheckinSubmission.passengerRef, passengerRef),
          ),
        )
        .limit(1);
      return rows[0] ? toRecord(rows[0]) : null;
    },

    async create(input: CreatePrecheckinSubmissionInput): Promise<PrecheckinSubmissionRecord> {
      const [row] = await db
        .insert(precheckinSubmission)
        .values({
          reservationRef: input.reservationRef,
          passengerRef: input.passengerRef,
          docType: input.docType,
          consentRecordId: input.consentRecordId,
          status: "received",
          photoObjectKey: input.photo.objectKey,
          photoWrappedDataKey: input.photo.wrappedDataKey,
          photoIv: input.photo.iv,
          photoAuthTag: input.photo.authTag,
          idFrontObjectKey: input.idFront.objectKey,
          idFrontWrappedDataKey: input.idFront.wrappedDataKey,
          idFrontIv: input.idFront.iv,
          idFrontAuthTag: input.idFront.authTag,
          idBackObjectKey: input.idBack?.objectKey ?? null,
          idBackWrappedDataKey: input.idBack?.wrappedDataKey ?? null,
          idBackIv: input.idBack?.iv ?? null,
          idBackAuthTag: input.idBack?.authTag ?? null,
          submittedAt: now(),
          purgeAfter: new Date(input.purgeAfter),
        })
        .onConflictDoNothing({
          target: [precheckinSubmission.reservationRef, precheckinSubmission.passengerRef],
        })
        .returning();
      if (!row) throw new AlreadySubmittedError(input.reservationRef, input.passengerRef);
      return toRecord(row);
    },

    async listPendingHandoff(): Promise<PrecheckinSubmissionRecord[]> {
      const rows = await db
        .select()
        .from(precheckinSubmission)
        .where(eq(precheckinSubmission.status, "received"))
        .orderBy(asc(precheckinSubmission.seq));
      return rows.map(toRecord);
    },

    async markHandedOff(id: string, handedOffAt: string, purgeAfter: string): Promise<PrecheckinSubmissionRecord> {
      if (!UUID.test(id)) throw unknownSubmission(id);
      const candidate = new Date(purgeAfter);
      const [row] = await db
        .update(precheckinSubmission)
        .set({
          status: "handed_off",
          handedOffAt: new Date(handedOffAt),
          purgeAfter: sql`LEAST(${precheckinSubmission.purgeAfter}, ${candidate.toISOString()}::timestamptz)`,
        })
        .where(and(eq(precheckinSubmission.id, id), ne(precheckinSubmission.status, "purged")))
        .returning();
      if (!row) throw new Error(`precheckin_submission "${id}" is unknown or already purged and cannot be handed off`);
      return toRecord(row);
    },

    async listPastPurgeAfter(asOf: Date): Promise<PrecheckinSubmissionRecord[]> {
      const rows = await db
        .select()
        .from(precheckinSubmission)
        .where(and(ne(precheckinSubmission.status, "purged"), lte(precheckinSubmission.purgeAfter, asOf)))
        .orderBy(asc(precheckinSubmission.seq));
      return rows.map(toRecord);
    },

    async markPurged(id: string, purgedAt: string): Promise<PrecheckinSubmissionRecord> {
      if (!UUID.test(id)) throw unknownSubmission(id);
      const empty = sql`''::bytea`;
      const emptyIfPresent = sql`CASE WHEN ${precheckinSubmission.idBackObjectKey} IS NULL THEN NULL ELSE ''::bytea END`;
      const [row] = await db
        .update(precheckinSubmission)
        .set({
          status: "purged",
          purgedAt: new Date(purgedAt),
          photoWrappedDataKey: empty,
          photoIv: empty,
          photoAuthTag: empty,
          idFrontWrappedDataKey: empty,
          idFrontIv: empty,
          idFrontAuthTag: empty,
          idBackWrappedDataKey: emptyIfPresent,
          idBackIv: emptyIfPresent,
          idBackAuthTag: emptyIfPresent,
        })
        .where(and(eq(precheckinSubmission.id, id), ne(precheckinSubmission.status, "purged")))
        .returning();
      if (row) return toRecord(row);
      // Zero rows: either unknown, or already purged. A retried purge is idempotent and keeps
      // the FIRST purged_at (first purge wins), so return the stored row rather than overwrite it.
      const [existing] = await db.select().from(precheckinSubmission).where(eq(precheckinSubmission.id, id)).limit(1);
      if (!existing) throw unknownSubmission(id);
      return toRecord(existing);
    },
  };
}
