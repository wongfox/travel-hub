import { asc, eq, lte } from "drizzle-orm";
import { StaffAlertPayloadSchema } from "contracts";
import type { Db } from "../../infra/db/client.js";
import { staffAlert } from "../../infra/db/schema.js";
import {
  DuplicateStaffAlertError,
  type CreateStaffAlertInput,
  type StaffAlertRecord,
  type StaffAlertStatus,
  type StaffAlertStore,
} from "../../modules/pulse/ports.js";
import {
  computePulsePurgeAfter,
  resolvePulseRetentionConfig,
  type PulseRetentionConfig,
} from "../../modules/pulse/retention.js";

type StaffAlertRow = typeof staffAlert.$inferSelect;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toRecord(row: StaffAlertRow): StaffAlertRecord {
  return {
    id: row.id,
    pulseResponseId: row.pulseResponseId,
    payload: row.payload,
    status: row.status,
    attempts: row.attempts,
    lastError: row.lastError,
    dispatchedAt: row.dispatchedAt ? row.dispatchedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    purgeAfter: row.purgeAfter.toISOString(),
  };
}

/**
 * Postgres/Drizzle `StaffAlertStore` over `staff_alert`, shared by `bff-api`
 * (creates the alert on a negative pulse) and `bff-worker` (dispatch + purge
 * scans) through the same `DATABASE_URL`. "Exactly one alert per passenger/leg"
 * is `UNIQUE(pulse_response_id)`: `create` is a single `INSERT ... ON CONFLICT
 * DO NOTHING`, so concurrent creators (across processes too) cannot both win and
 * a loser gets `DuplicateStaffAlertError` without touching the existing row.
 * The payload is re-validated against the strict `StaffAlertPayloadSchema` on
 * every write (the schema rejects any extra field, so no free-text PII can be
 * stored); it is never logged. `purgeAfter` comes from `payload.answeredAt`.
 */
export function createPostgresStaffAlertStore(
  db: Db,
  now: () => Date = () => new Date(),
  retention: PulseRetentionConfig = resolvePulseRetentionConfig({}),
): StaffAlertStore {
  return {
    async create(input: CreateStaffAlertInput): Promise<StaffAlertRecord> {
      const payload = StaffAlertPayloadSchema.parse(input.payload);
      const [row] = await db
        .insert(staffAlert)
        .values({
          pulseResponseId: input.pulseResponseId,
          payload,
          createdAt: now(),
          purgeAfter: new Date(computePulsePurgeAfter(payload.answeredAt, retention)),
        })
        .onConflictDoNothing({ target: staffAlert.pulseResponseId })
        .returning();
      if (!row) throw new DuplicateStaffAlertError(input.pulseResponseId);
      return toRecord(row);
    },

    async findByPulseResponseId(pulseResponseId: string): Promise<StaffAlertRecord | null> {
      if (!UUID.test(pulseResponseId)) return null;
      const [row] = await db.select().from(staffAlert).where(eq(staffAlert.pulseResponseId, pulseResponseId)).limit(1);
      return row ? toRecord(row) : null;
    },

    async listPending(): Promise<StaffAlertRecord[]> {
      const rows = await db.select().from(staffAlert).where(eq(staffAlert.status, "pending")).orderBy(asc(staffAlert.seq));
      return rows.map(toRecord);
    },

    async updateStatus(
      id: string,
      status: StaffAlertStatus,
      detail?: { attempts?: number; lastError?: string | null; dispatchedAt?: string | null },
    ): Promise<void> {
      if (!UUID.test(id)) return;
      await db
        .update(staffAlert)
        .set({
          status,
          ...(detail?.attempts !== undefined ? { attempts: detail.attempts } : {}),
          ...(detail?.lastError !== undefined ? { lastError: detail.lastError } : {}),
          ...(detail?.dispatchedAt !== undefined
            ? { dispatchedAt: detail.dispatchedAt === null ? null : new Date(detail.dispatchedAt) }
            : {}),
        })
        .where(eq(staffAlert.id, id));
    },

    async listPastPurgeAfter(asOf: Date): Promise<StaffAlertRecord[]> {
      const rows = await db.select().from(staffAlert).where(lte(staffAlert.purgeAfter, asOf)).orderBy(asc(staffAlert.seq));
      return rows.map(toRecord);
    },

    async deleteById(id: string): Promise<void> {
      if (!UUID.test(id)) return;
      await db.delete(staffAlert).where(eq(staffAlert.id, id));
    },
  };
}
