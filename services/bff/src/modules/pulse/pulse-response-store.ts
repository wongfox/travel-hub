import { randomUUID } from "node:crypto";
import {
  DuplicatePulseResponseError,
  type CreatePulseResponseInput,
  type PulseResponseRecord,
  type PulseResponseStore,
} from "./ports.js";
import { computePulsePurgeAfter, resolvePulseRetentionConfig, type PulseRetentionConfig } from "./retention.js";

/**
 * Deterministic, in-memory `PulseResponseStore` (task 11.4), same
 * in-memory-port-first convention as `NotificationStore`/
 * `PushSubscriptionStore`: `create()` throws on a composite-key collision,
 * the actual substitute for the design's real Postgres
 * `unique(reservation_ref, passenger_ref, leg_ref)` index.
 *
 * `retention` (task 12.3) defaults to the dev/non-production fallback so
 * every caller that predates task 12.3 keeps working unchanged; `purgeAfter`
 * is computed once at creation time from the SAME `answeredAt` this store
 * stamps, so the two values are never inconsistent with each other.
 */
export function createInMemoryPulseResponseStore(
  now: () => Date = () => new Date(),
  retention: PulseRetentionConfig = resolvePulseRetentionConfig({}),
): PulseResponseStore {
  const records: PulseResponseRecord[] = [];

  function find(reservationRef: string, passengerRef: string, legRef: string): PulseResponseRecord | undefined {
    return records.find(
      (record) =>
        record.reservationRef === reservationRef &&
        record.passengerRef === passengerRef &&
        record.legRef === legRef,
    );
  }

  return {
    async create(input: CreatePulseResponseInput): Promise<PulseResponseRecord> {
      if (find(input.reservationRef, input.passengerRef, input.legRef)) {
        throw new DuplicatePulseResponseError(input.reservationRef, input.passengerRef, input.legRef);
      }

      const answeredAt = now().toISOString();
      const record: PulseResponseRecord = {
        id: randomUUID(),
        reservationRef: input.reservationRef,
        passengerRef: input.passengerRef,
        legRef: input.legRef,
        score: input.score,
        locale: input.locale,
        answeredAt,
        purgeAfter: computePulsePurgeAfter(answeredAt, retention),
      };
      records.push(record);
      return record;
    },

    async findByComposite(
      reservationRef: string,
      passengerRef: string,
      legRef: string,
    ): Promise<PulseResponseRecord | null> {
      return find(reservationRef, passengerRef, legRef) ?? null;
    },

    async list(): Promise<PulseResponseRecord[]> {
      return [...records];
    },

    async listPastPurgeAfter(asOf: Date): Promise<PulseResponseRecord[]> {
      const asOfMs = asOf.getTime();
      return records.filter((record) => new Date(record.purgeAfter).getTime() <= asOfMs);
    },

    async deleteById(id: string): Promise<void> {
      const index = records.findIndex((record) => record.id === id);
      if (index !== -1) records.splice(index, 1);
    },
  };
}
