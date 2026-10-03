import { randomUUID } from "node:crypto";
import { StaffAlertPayloadSchema } from "contracts";
import {
  DuplicateStaffAlertError,
  type CreateStaffAlertInput,
  type StaffAlertRecord,
  type StaffAlertStatus,
  type StaffAlertStore,
} from "./ports.js";
import { computePulsePurgeAfter, resolvePulseRetentionConfig, type PulseRetentionConfig } from "./retention.js";

/**
 * Deterministic, in-memory `StaffAlertStore` (task 11.5, design Decision 12):
 * keyed by `pulseResponseId` itself, so a second `create()` for an
 * already-seen `pulseResponseId` is REJECTED by the store, not merely
 * discouraged by a caller-side check — this is the actual substitute for the
 * design's real Postgres `unique(pulse_response_id)` index, same convention
 * as `NotificationStore`/`dedupeKey`. No `await` runs between the
 * duplicate-check and the insert, so this enforcement holds even under
 * concurrent calls for the same `pulseResponseId` (task 11.5 acceptance:
 * "exactly one staff_alert row even under a simulated concurrent retry").
 */
export function createInMemoryStaffAlertStore(
  now: () => Date = () => new Date(),
  retention: PulseRetentionConfig = resolvePulseRetentionConfig({}),
): StaffAlertStore {
  const byPulseResponseId = new Map<string, StaffAlertRecord>();
  const byId = new Map<string, StaffAlertRecord>();

  return {
    async create(input: CreateStaffAlertInput): Promise<StaffAlertRecord> {
      // Same strict minimal-PII boundary as the Postgres adapter (extra fields are rejected, never stored).
      StaffAlertPayloadSchema.parse(input.payload);
      if (byPulseResponseId.has(input.pulseResponseId)) {
        throw new DuplicateStaffAlertError(input.pulseResponseId);
      }

      const record: StaffAlertRecord = {
        id: randomUUID(),
        pulseResponseId: input.pulseResponseId,
        payload: input.payload,
        status: "pending",
        attempts: 0,
        lastError: null,
        dispatchedAt: null,
        createdAt: now().toISOString(),
        // `payload.answeredAt` (the pulse response's own answered time, task
        // 12.3), not `createdAt` — the design names `answered_at +
        // STAFF_ALERT_RETENTION_DAYS` for BOTH `pulse_response` and
        // `staff_alert`, so the two purge times stay consistent even though
        // this row is created slightly after the response.
        purgeAfter: computePulsePurgeAfter(input.payload.answeredAt, retention),
      };
      byPulseResponseId.set(record.pulseResponseId, record);
      byId.set(record.id, record);
      return record;
    },

    async findByPulseResponseId(pulseResponseId: string): Promise<StaffAlertRecord | null> {
      return byPulseResponseId.get(pulseResponseId) ?? null;
    },

    async listPending(): Promise<StaffAlertRecord[]> {
      return [...byId.values()].filter((record) => record.status === "pending");
    },

    async updateStatus(
      id: string,
      status: StaffAlertStatus,
      detail?: { attempts?: number; lastError?: string | null; dispatchedAt?: string | null },
    ): Promise<void> {
      const record = byId.get(id);
      if (!record) return;
      record.status = status;
      if (detail?.attempts !== undefined) record.attempts = detail.attempts;
      if (detail?.lastError !== undefined) record.lastError = detail.lastError;
      if (detail?.dispatchedAt !== undefined) record.dispatchedAt = detail.dispatchedAt;
    },

    async listPastPurgeAfter(asOf: Date): Promise<StaffAlertRecord[]> {
      const asOfMs = asOf.getTime();
      return [...byId.values()].filter((record) => new Date(record.purgeAfter).getTime() <= asOfMs);
    },

    async deleteById(id: string): Promise<void> {
      const record = byId.get(id);
      if (record) {
        byId.delete(id);
        byPulseResponseId.delete(record.pulseResponseId);
      }
    },
  };
}
