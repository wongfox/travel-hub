import { randomUUID } from "node:crypto";
import type { CreatePushSubscriptionInput, PushSubscriptionRecord, PushSubscriptionStore } from "./ports.js";

/**
 * Deterministic, in-memory `PushSubscriptionStore` (task 11.1): the dev/test
 * default; `adapters/push-subscription-store/postgres.ts` is the shared
 * Postgres implementation (same conformance suite) for api + worker.
 */
export function createInMemoryPushSubscriptionStore(now: () => Date = () => new Date()): PushSubscriptionStore {
  const byId = new Map<string, PushSubscriptionRecord>();

  return {
    async create(input: CreatePushSubscriptionInput): Promise<PushSubscriptionRecord> {
      const record: PushSubscriptionRecord = {
        id: randomUUID(),
        linkId: input.linkId,
        reservationRef: input.reservationRef,
        passengerScope: input.passengerScope,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        locale: input.locale,
        consentRecordId: input.consentRecordId,
        createdAt: now().toISOString(),
        expiresAt: input.expiresAt,
      };
      byId.set(record.id, record);
      return record;
    },

    async findById(id: string): Promise<PushSubscriptionRecord | null> {
      return byId.get(id) ?? null;
    },

    async findActiveByReservation(reservationRef: string): Promise<PushSubscriptionRecord[]> {
      const asOf = now().getTime();
      return [...byId.values()].filter(
        (record) => record.reservationRef === reservationRef && new Date(record.expiresAt).getTime() > asOf,
      );
    },

    async deleteById(id: string): Promise<void> {
      byId.delete(id);
    },

    async deleteByLinkId(linkId: string): Promise<void> {
      for (const record of [...byId.values()]) {
        if (record.linkId === linkId) {
          byId.delete(record.id);
        }
      }
    },

    async deleteByReservation(reservationRef: string): Promise<void> {
      for (const record of [...byId.values()]) {
        if (record.reservationRef === reservationRef) {
          byId.delete(record.id);
        }
      }
    },

    async listExpired(asOf: Date): Promise<PushSubscriptionRecord[]> {
      const asOfMs = asOf.getTime();
      return [...byId.values()].filter((record) => new Date(record.expiresAt).getTime() <= asOfMs);
    },
  };
}
