import { randomUUID } from "node:crypto";
import {
  DuplicatePulseResponseError,
  type CreatePulseResponseInput,
  type PulseResponseRecord,
  type PulseResponseStore,
} from "./ports.js";

/**
 * Deterministic, in-memory `PulseResponseStore` (task 11.4), same
 * in-memory-port-first convention as `NotificationStore`/
 * `PushSubscriptionStore`: `create()` throws on a composite-key collision,
 * the actual substitute for the design's real Postgres
 * `unique(reservation_ref, passenger_ref, leg_ref)` index.
 */
export function createInMemoryPulseResponseStore(now: () => Date = () => new Date()): PulseResponseStore {
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

      const record: PulseResponseRecord = {
        id: randomUUID(),
        reservationRef: input.reservationRef,
        passengerRef: input.passengerRef,
        legRef: input.legRef,
        score: input.score,
        locale: input.locale,
        answeredAt: now().toISOString(),
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
  };
}
