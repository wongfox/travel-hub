import { and, asc, eq, gt, lte } from "drizzle-orm";
import type { Locale } from "contracts";
import type { Db } from "../../infra/db/client.js";
import { pushSubscription } from "../../infra/db/schema.js";
import type {
  CreatePushSubscriptionInput,
  PushSubscriptionRecord,
  PushSubscriptionStore,
} from "../../modules/notifications/ports.js";

type PushSubscriptionRow = typeof pushSubscription.$inferSelect;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toRecord(row: PushSubscriptionRow): PushSubscriptionRecord {
  return {
    id: row.id,
    linkId: row.linkId,
    reservationRef: row.reservationRef,
    passengerScope: row.passengerScope,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
    locale: row.locale as Locale,
    consentRecordId: row.consentRecordId,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

/**
 * Postgres/Drizzle `PushSubscriptionStore` over `push_subscription`, shared by
 * `bff-api` and `bff-worker` through the same `DATABASE_URL`. A lookup/delete
 * by an id that is not a uuid can never match a row, so it behaves like an
 * unknown id (null / no-op) instead of surfacing a Postgres cast error, the
 * same as the in-memory store. Never logs subscription secrets.
 */
export function createPostgresPushSubscriptionStore(db: Db, now: () => Date = () => new Date()): PushSubscriptionStore {
  return {
    async create(input: CreatePushSubscriptionInput): Promise<PushSubscriptionRecord> {
      const [row] = await db
        .insert(pushSubscription)
        .values({
          linkId: input.linkId,
          reservationRef: input.reservationRef,
          passengerScope: input.passengerScope,
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          auth: input.auth,
          locale: input.locale,
          consentRecordId: input.consentRecordId,
          createdAt: now(),
          expiresAt: new Date(input.expiresAt),
        })
        .returning();
      if (!row) throw new Error("push_subscription insert returned no row");
      return toRecord(row);
    },

    async findById(id: string): Promise<PushSubscriptionRecord | null> {
      if (!UUID.test(id)) return null;
      const [row] = await db.select().from(pushSubscription).where(eq(pushSubscription.id, id)).limit(1);
      return row ? toRecord(row) : null;
    },

    async findActiveByReservation(reservationRef: string): Promise<PushSubscriptionRecord[]> {
      const rows = await db
        .select()
        .from(pushSubscription)
        .where(and(eq(pushSubscription.reservationRef, reservationRef), gt(pushSubscription.expiresAt, now())))
        .orderBy(asc(pushSubscription.seq));
      return rows.map(toRecord);
    },

    async deleteById(id: string): Promise<void> {
      if (!UUID.test(id)) return;
      await db.delete(pushSubscription).where(eq(pushSubscription.id, id));
    },

    async deleteByLinkId(linkId: string): Promise<void> {
      if (!UUID.test(linkId)) return;
      await db.delete(pushSubscription).where(eq(pushSubscription.linkId, linkId));
    },

    async deleteByReservation(reservationRef: string): Promise<void> {
      await db.delete(pushSubscription).where(eq(pushSubscription.reservationRef, reservationRef));
    },

    async listExpired(asOf: Date): Promise<PushSubscriptionRecord[]> {
      const rows = await db
        .select()
        .from(pushSubscription)
        .where(lte(pushSubscription.expiresAt, asOf))
        .orderBy(asc(pushSubscription.seq));
      return rows.map(toRecord);
    },
  };
}
