import { randomUUID } from "node:crypto";
import type { AnalyticsEventRecord, AnalyticsEventStore, CreateAnalyticsEventInput } from "./ports.js";

/**
 * Deterministic, in-memory `AnalyticsEventStore` (task 12.1), same
 * in-memory-port-first convention as every other store in this codebase.
 * `create`'s parameter type (`CreateAnalyticsEventInput` =
 * `PseudonymousAnalyticsEvent`) structurally has no `reservationRef` field,
 * so this store cannot persist one even if a caller tried.
 */
export function createInMemoryAnalyticsEventStore(now: () => Date = () => new Date()): AnalyticsEventStore {
  const byId = new Map<string, AnalyticsEventRecord>();
  const order: string[] = [];

  return {
    async create(input: CreateAnalyticsEventInput): Promise<AnalyticsEventRecord> {
      const record: AnalyticsEventRecord = {
        ...input,
        id: randomUUID(),
        createdAt: now().toISOString(),
        forwardedAt: null,
      };
      byId.set(record.id, record);
      order.push(record.id);
      return record;
    },

    async listPendingForward(): Promise<AnalyticsEventRecord[]> {
      return order.map((id) => byId.get(id)!).filter((record) => record.forwardedAt === null);
    },

    async markForwarded(ids: string[], forwardedAt: string): Promise<void> {
      for (const id of ids) {
        const record = byId.get(id);
        if (record) record.forwardedAt = forwardedAt;
      }
    },

    async list(): Promise<AnalyticsEventRecord[]> {
      return order.map((id) => byId.get(id)!);
    },
  };
}
