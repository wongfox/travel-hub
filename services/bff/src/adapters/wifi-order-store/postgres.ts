import { and, asc, eq } from "drizzle-orm";
import type { Db } from "../../infra/db/client.js";
import { wifiOrder, wifiOrderEvent } from "../../infra/db/schema.js";
import { WifiOrderNotFoundError } from "../../modules/wifi-checkout/errors.js";
import type {
  CreateWifiOrderRecordInput,
  WifiOrderEventRecord,
  WifiOrderRecord,
  WifiOrderStore,
} from "../../modules/wifi-checkout/ports.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type OrderRow = typeof wifiOrder.$inferSelect;
type EventRow = typeof wifiOrderEvent.$inferSelect;

const iso = (value: Date | null): string | null => (value ? value.toISOString() : null);

function toRecord(row: OrderRow): WifiOrderRecord {
  return {
    id: row.id,
    reservationRef: row.reservationRef,
    passengerRef: row.passengerRef,
    packageId: row.packageId,
    legRef: row.legRef,
    buyerEmail: row.buyerEmail,
    amountMinor: row.amountMinor,
    currency: row.currency as WifiOrderRecord["currency"],
    status: row.status,
    idempotencyKey: row.idempotencyKey,
    gatewaySessionRef: row.gatewaySessionRef,
    gatewayPaymentRef: row.gatewayPaymentRef,
    entitlementRef: row.entitlementRef,
    entitlementExpiresAt: iso(row.entitlementExpiresAt),
    sirRegisteredAt: iso(row.sirRegisteredAt),
    sirSaleRef: row.sirSaleRef,
    sirRegistrationAttempts: row.sirRegistrationAttempts,
    sirReconciliationRequired: row.sirReconciliationRequired,
    receiptIssuedAt: iso(row.receiptIssuedAt),
    receiptRef: row.receiptRef,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toEvent(row: EventRow): WifiOrderEventRecord {
  return {
    id: row.id,
    orderId: row.orderId,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    detail: row.detail,
    at: row.at.toISOString(),
  };
}

type TransitionPatch = Parameters<WifiOrderStore["transition"]>[3];

/** Maps the port's ISO-string patch to column values; `undefined` keys are dropped so they leave the column untouched. */
function toColumnPatch(patch: TransitionPatch): Partial<typeof wifiOrder.$inferInsert> {
  const columns: Partial<typeof wifiOrder.$inferInsert> = {};
  if (patch.gatewaySessionRef !== undefined) columns.gatewaySessionRef = patch.gatewaySessionRef;
  if (patch.gatewayPaymentRef !== undefined) columns.gatewayPaymentRef = patch.gatewayPaymentRef;
  if (patch.entitlementRef !== undefined) columns.entitlementRef = patch.entitlementRef;
  if (patch.entitlementExpiresAt !== undefined) {
    columns.entitlementExpiresAt = patch.entitlementExpiresAt ? new Date(patch.entitlementExpiresAt) : null;
  }
  if (patch.sirRegisteredAt !== undefined) {
    columns.sirRegisteredAt = patch.sirRegisteredAt ? new Date(patch.sirRegisteredAt) : null;
  }
  if (patch.sirSaleRef !== undefined) columns.sirSaleRef = patch.sirSaleRef;
  if (patch.sirRegistrationAttempts !== undefined) columns.sirRegistrationAttempts = patch.sirRegistrationAttempts;
  if (patch.sirReconciliationRequired !== undefined) {
    columns.sirReconciliationRequired = patch.sirReconciliationRequired;
  }
  if (patch.receiptIssuedAt !== undefined) {
    columns.receiptIssuedAt = patch.receiptIssuedAt ? new Date(patch.receiptIssuedAt) : null;
  }
  if (patch.receiptRef !== undefined) columns.receiptRef = patch.receiptRef;
  return columns;
}

/**
 * Postgres/Drizzle `WifiOrderStore` over `wifi_order`/`wifi_order_event`,
 * shared by `bff-api` and `bff-worker` (same `DATABASE_URL`). `transition` is
 * an atomic compare-and-swap: ONE `UPDATE ... WHERE id = ? AND status = ?
 * RETURNING *` plus the event insert in the same transaction; a concurrent
 * writer that loses the row lock re-checks the predicate and matches nothing.
 */
export function createPostgresWifiOrderStore(db: Db, now: () => Date = () => new Date()): WifiOrderStore {
  return {
    async findByIdempotencyKey(idempotencyKey) {
      const [row] = await db.select().from(wifiOrder).where(eq(wifiOrder.idempotencyKey, idempotencyKey));
      return row ? toRecord(row) : null;
    },

    async findById(id) {
      if (!UUID_PATTERN.test(id)) return null;
      const [row] = await db.select().from(wifiOrder).where(eq(wifiOrder.id, id));
      return row ? toRecord(row) : null;
    },

    async create(input: CreateWifiOrderRecordInput) {
      const at = now();
      const [inserted] = await db
        .insert(wifiOrder)
        .values({
          reservationRef: input.reservationRef,
          passengerRef: input.passengerRef,
          packageId: input.packageId,
          legRef: input.legRef ?? "",
          buyerEmail: input.buyerEmail ?? "",
          amountMinor: input.amountMinor,
          currency: input.currency,
          status: "CREATED",
          idempotencyKey: input.idempotencyKey,
          createdAt: at,
          updatedAt: at,
        })
        .onConflictDoNothing({ target: wifiOrder.idempotencyKey })
        .returning();
      if (inserted) return toRecord(inserted);

      // Lost the idempotency-key race (or a replay): return the original row.
      const [existing] = await db.select().from(wifiOrder).where(eq(wifiOrder.idempotencyKey, input.idempotencyKey));
      if (!existing) throw new Error(`wifi_order for idempotency key vanished after conflict`);
      return toRecord(existing);
    },

    async transition(id, expectedStatus, toStatus, patch) {
      if (!UUID_PATTERN.test(id)) throw new WifiOrderNotFoundError(id);
      const at = now();
      return db.transaction(async (tx) => {
        const [updated] = await tx
          .update(wifiOrder)
          .set({ ...toColumnPatch(patch), status: toStatus, updatedAt: at })
          .where(and(eq(wifiOrder.id, id), eq(wifiOrder.status, expectedStatus)))
          .returning();

        if (!updated) {
          const [exists] = await tx.select({ id: wifiOrder.id }).from(wifiOrder).where(eq(wifiOrder.id, id));
          if (!exists) throw new WifiOrderNotFoundError(id);
          return null; // CAS miss: the status is no longer `expectedStatus`
        }

        const detail = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
        await tx.insert(wifiOrderEvent).values({
          orderId: id,
          fromStatus: expectedStatus,
          toStatus,
          detail,
          at,
        });
        return toRecord(updated);
      });
    },

    async listEventsForOrder(id) {
      if (!UUID_PATTERN.test(id)) return [];
      const rows = await db
        .select()
        .from(wifiOrderEvent)
        .where(eq(wifiOrderEvent.orderId, id))
        .orderBy(asc(wifiOrderEvent.seq));
      return rows.map(toEvent);
    },

    async listByStatus(status) {
      const rows = await db
        .select()
        .from(wifiOrder)
        .where(eq(wifiOrder.status, status))
        .orderBy(asc(wifiOrder.createdAt), asc(wifiOrder.id));
      return rows.map(toRecord);
    },
  };
}
