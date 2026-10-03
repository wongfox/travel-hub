import { and, asc, eq, lte } from "drizzle-orm";
import type { Locale } from "contracts";
import type { Db } from "../../infra/db/client.js";
import { pulseResponse } from "../../infra/db/schema.js";
import {
  DuplicatePulseResponseError,
  type CreatePulseResponseInput,
  type PulseResponseRecord,
  type PulseResponseStore,
} from "../../modules/pulse/ports.js";
import {
  computePulsePurgeAfter,
  resolvePulseRetentionConfig,
  type PulseRetentionConfig,
} from "../../modules/pulse/retention.js";

type PulseResponseRow = typeof pulseResponse.$inferSelect;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toRecord(row: PulseResponseRow): PulseResponseRecord {
  return {
    id: row.id,
    reservationRef: row.reservationRef,
    passengerRef: row.passengerRef,
    legRef: row.legRef,
    score: row.score,
    locale: row.locale as Locale,
    answeredAt: row.answeredAt.toISOString(),
    purgeAfter: row.purgeAfter.toISOString(),
  };
}

/**
 * Postgres/Drizzle `PulseResponseStore` over `pulse_response`, shared by
 * `bff-api` (writes) and `bff-worker` (purge scan) through the same
 * `DATABASE_URL`. One response per passenger/leg is the table's UNIQUE
 * constraint: `create` is a single `INSERT ... ON CONFLICT DO NOTHING`, so
 * concurrent submissions cannot both win and a loser gets
 * `DuplicatePulseResponseError` without touching the existing row.
 * `answeredAt` is stamped from `now` and `purgeAfter` computed from that same
 * instant, exactly as the in-memory store does.
 */
export function createPostgresPulseResponseStore(
  db: Db,
  now: () => Date = () => new Date(),
  retention: PulseRetentionConfig = resolvePulseRetentionConfig({}),
): PulseResponseStore {
  return {
    async create(input: CreatePulseResponseInput): Promise<PulseResponseRecord> {
      const answeredAt = now();
      const [row] = await db
        .insert(pulseResponse)
        .values({
          reservationRef: input.reservationRef,
          passengerRef: input.passengerRef,
          legRef: input.legRef,
          score: input.score,
          locale: input.locale,
          answeredAt,
          purgeAfter: new Date(computePulsePurgeAfter(answeredAt.toISOString(), retention)),
        })
        .onConflictDoNothing({ target: [pulseResponse.reservationRef, pulseResponse.passengerRef, pulseResponse.legRef] })
        .returning();
      if (!row) throw new DuplicatePulseResponseError(input.reservationRef, input.passengerRef, input.legRef);
      return toRecord(row);
    },

    async findByComposite(reservationRef, passengerRef, legRef): Promise<PulseResponseRecord | null> {
      const rows = await db
        .select()
        .from(pulseResponse)
        .where(
          and(
            eq(pulseResponse.reservationRef, reservationRef),
            eq(pulseResponse.passengerRef, passengerRef),
            eq(pulseResponse.legRef, legRef),
          ),
        )
        .limit(1);
      return rows[0] ? toRecord(rows[0]) : null;
    },

    async list(): Promise<PulseResponseRecord[]> {
      const rows = await db.select().from(pulseResponse).orderBy(asc(pulseResponse.seq));
      return rows.map(toRecord);
    },

    async listPastPurgeAfter(asOf: Date): Promise<PulseResponseRecord[]> {
      const rows = await db
        .select()
        .from(pulseResponse)
        .where(lte(pulseResponse.purgeAfter, asOf))
        .orderBy(asc(pulseResponse.seq));
      return rows.map(toRecord);
    },

    async deleteById(id: string): Promise<void> {
      if (!UUID.test(id)) return;
      await db.delete(pulseResponse).where(eq(pulseResponse.id, id));
    },
  };
}
