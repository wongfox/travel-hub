import { randomUUID } from "node:crypto";
import {
  DuplicateStaffAlertError,
  type CreateStaffAlertInput,
  type StaffAlertRecord,
  type StaffAlertStatus,
  type StaffAlertStore,
} from "./ports.js";

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
export function createInMemoryStaffAlertStore(now: () => Date = () => new Date()): StaffAlertStore {
  const byPulseResponseId = new Map<string, StaffAlertRecord>();
  const byId = new Map<string, StaffAlertRecord>();

  return {
    async create(input: CreateStaffAlertInput): Promise<StaffAlertRecord> {
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
  };
}
