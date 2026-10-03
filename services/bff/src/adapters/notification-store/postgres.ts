import { eq, sql } from "drizzle-orm";
import type { AlertType } from "contracts";
import type { Db } from "../../infra/db/client.js";
import { notification } from "../../infra/db/schema.js";
import {
  DuplicateNotificationError,
  type CreateNotificationInput,
  type NotificationRecord,
  type NotificationStatus,
  type NotificationStore,
} from "../../modules/notifications/ports.js";

type NotificationRow = typeof notification.$inferSelect;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toRecord(row: NotificationRow): NotificationRecord {
  return {
    id: row.id,
    reservationRef: row.reservationRef,
    alertType: row.alertType as AlertType,
    sourceEventId: row.sourceEventId,
    channel: row.channel,
    dedupeKey: row.dedupeKey,
    status: row.status,
    attempts: row.attempts,
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Postgres/Drizzle `NotificationStore` over `notification`, shared by
 * `bff-api` and `bff-worker` through the same `DATABASE_URL`. `dedupe_key`
 * uniqueness is enforced by the table's UNIQUE constraint: `create` is a
 * single `INSERT ... ON CONFLICT DO NOTHING`, so concurrent creators (or two
 * worker processes) cannot both win, and a loser gets `DuplicateNotificationError`
 * without touching the existing row.
 */
export function createPostgresNotificationStore(db: Db, now: () => Date = () => new Date()): NotificationStore {
  return {
    async create(input: CreateNotificationInput): Promise<NotificationRecord> {
      const [row] = await db
        .insert(notification)
        .values({
          reservationRef: input.reservationRef,
          alertType: input.alertType,
          sourceEventId: input.sourceEventId,
          channel: input.channel,
          dedupeKey: input.dedupeKey,
          status: input.status,
          createdAt: now(),
        })
        .onConflictDoNothing({ target: notification.dedupeKey })
        .returning();
      if (!row) throw new DuplicateNotificationError(input.dedupeKey);
      return toRecord(row);
    },

    async findByDedupeKey(dedupeKey: string): Promise<NotificationRecord | null> {
      const [row] = await db.select().from(notification).where(eq(notification.dedupeKey, dedupeKey)).limit(1);
      return row ? toRecord(row) : null;
    },

    async updateStatus(id: string, status: NotificationStatus, sentAt?: string): Promise<void> {
      if (!UUID.test(id)) return;
      await db
        .update(notification)
        .set({
          status,
          attempts: sql`${notification.attempts} + 1`,
          ...(sentAt !== undefined ? { sentAt: new Date(sentAt) } : {}),
        })
        .where(eq(notification.id, id));
    },
  };
}
