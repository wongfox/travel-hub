import { randomUUID } from "node:crypto";
import {
  DuplicateNotificationError,
  type CreateNotificationInput,
  type NotificationRecord,
  type NotificationStatus,
  type NotificationStore,
} from "./ports.js";

/**
 * Deterministic, in-memory `NotificationStore` (task 11.2, design Decision
 * 11): keyed by `dedupeKey` itself, so a second `create()` for an
 * already-seen `dedupeKey` is REJECTED by the store, not merely discouraged
 * by a caller-side check — this is the actual substitute for the design's
 * real Postgres `unique` index on `notification.dedupe_key` (documented
 * in-memory-port-first deviation, same convention as every other store in
 * this module set until a Drizzle-backed adapter lands).
 */
export function createInMemoryNotificationStore(): NotificationStore {
  const byDedupeKey = new Map<string, NotificationRecord>();
  const byId = new Map<string, NotificationRecord>();

  return {
    async create(input: CreateNotificationInput): Promise<NotificationRecord> {
      if (byDedupeKey.has(input.dedupeKey)) {
        throw new DuplicateNotificationError(input.dedupeKey);
      }

      const record: NotificationRecord = {
        id: randomUUID(),
        reservationRef: input.reservationRef,
        alertType: input.alertType,
        sourceEventId: input.sourceEventId,
        channel: input.channel,
        dedupeKey: input.dedupeKey,
        status: input.status,
        attempts: 0,
        sentAt: null,
        createdAt: new Date().toISOString(),
      };
      byDedupeKey.set(record.dedupeKey, record);
      byId.set(record.id, record);
      return record;
    },

    async findByDedupeKey(dedupeKey: string): Promise<NotificationRecord | null> {
      return byDedupeKey.get(dedupeKey) ?? null;
    },

    async updateStatus(id: string, status: NotificationStatus, sentAt?: string): Promise<void> {
      const record = byId.get(id);
      if (!record) return;
      record.status = status;
      record.attempts += 1;
      if (sentAt !== undefined) {
        record.sentAt = sentAt;
      }
    },
  };
}
