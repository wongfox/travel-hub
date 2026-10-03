import { randomUUID } from "node:crypto";
import { WifiOrderNotFoundError } from "./errors.js";
import type {
  CreateWifiOrderRecordInput,
  WifiOrderEventRecord,
  WifiOrderRecord,
  WifiOrderStore,
} from "./ports.js";

/**
 * Deterministic, in-memory `WifiOrderStore` (task 10.1), same "in-memory
 * first, Drizzle later" convention as `PrecheckinSubmissionStore` (task 8.3)
 * and `ContentCache` (task 9.1, WU14-17's documented precedent): a real
 * `wifi_order`/`wifi_order_event` Drizzle schema + migration lands once a
 * consumer needs it against a live Postgres.
 */
function definedOnly<T extends object>(patch: T): T {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as T;
}

export function createInMemoryWifiOrderStore(now: () => Date = () => new Date()): WifiOrderStore {
  const ordersById = new Map<string, WifiOrderRecord>();
  const orderIdByIdempotencyKey = new Map<string, string>();
  const eventsByOrderId = new Map<string, WifiOrderEventRecord[]>();

  return {
    async findByIdempotencyKey(idempotencyKey: string) {
      const id = orderIdByIdempotencyKey.get(idempotencyKey);
      return id ? (ordersById.get(id) ?? null) : null;
    },

    async findById(id: string) {
      return ordersById.get(id) ?? null;
    },

    async create(input: CreateWifiOrderRecordInput) {
      const existingId = orderIdByIdempotencyKey.get(input.idempotencyKey);
      if (existingId) {
        const existing = ordersById.get(existingId);
        if (existing) return existing;
      }

      const at = now().toISOString();
      const record: WifiOrderRecord = {
        id: randomUUID(),
        reservationRef: input.reservationRef,
        passengerRef: input.passengerRef,
        packageId: input.packageId,
        legRef: input.legRef ?? "",
        buyerEmail: input.buyerEmail ?? "",
        amountMinor: input.amountMinor,
        currency: input.currency,
        status: "CREATED",
        idempotencyKey: input.idempotencyKey,
        gatewaySessionRef: null,
        gatewayPaymentRef: null,
        entitlementRef: null,
        entitlementExpiresAt: null,
        sirRegisteredAt: null,
        sirSaleRef: null,
        sirRegistrationAttempts: 0,
        sirReconciliationRequired: false,
        receiptIssuedAt: null,
        receiptRef: null,
        createdAt: at,
        updatedAt: at,
      };
      ordersById.set(record.id, record);
      orderIdByIdempotencyKey.set(input.idempotencyKey, record.id);
      eventsByOrderId.set(record.id, []);
      return record;
    },

    async transition(id, expectedStatus, toStatus, patch) {
      const existing = ordersById.get(id);
      if (!existing) {
        throw new WifiOrderNotFoundError(id);
      }
      // Compare-and-swap: no await between this check and the write below, so
      // it is atomic within the single-threaded event loop.
      if (existing.status !== expectedStatus) {
        return null;
      }

      const at = now().toISOString();
      const updated: WifiOrderRecord = {
        ...existing,
        ...definedOnly(patch),
        status: toStatus,
        updatedAt: at,
      };
      ordersById.set(id, updated);

      const events = eventsByOrderId.get(id) ?? [];
      events.push({
        id: randomUUID(),
        orderId: id,
        fromStatus: existing.status,
        toStatus,
        detail: definedOnly(patch),
        at,
      });
      eventsByOrderId.set(id, events);

      return updated;
    },

    async listEventsForOrder(id: string) {
      return eventsByOrderId.get(id) ?? [];
    },

    async listByStatus(status) {
      return [...ordersById.values()].filter((order) => order.status === status);
    },
  };
}
