import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "../../infra/db/client.js";
import { analyticsEvent } from "../../infra/db/schema.js";
import type { AnalyticsEventRecord, AnalyticsEventStore, CreateAnalyticsEventInput } from "../../modules/analytics/ports.js";

type EventRow = typeof analyticsEvent.$inferSelect;

function toRecord(row: EventRow): AnalyticsEventRecord {
  return {
    id: row.id,
    name: row.name as AnalyticsEventRecord["name"],
    tripHash: row.tripHash,
    occurredAt: row.occurredAt.toISOString(),
    ...(row.props ? { props: row.props } : {}),
    createdAt: row.createdAt.toISOString(),
    forwardedAt: row.forwardedAt ? row.forwardedAt.toISOString() : null,
  };
}

function toValues(input: CreateAnalyticsEventInput, createdAt: Date): typeof analyticsEvent.$inferInsert {
  const occurredAt = new Date(input.occurredAt);
  if (Number.isNaN(occurredAt.getTime())) throw new Error(`invalid occurredAt: ${input.occurredAt}`);
  return {
    name: input.name,
    tripHash: input.tripHash,
    occurredAt,
    props: input.props ?? null,
    createdAt,
  };
}

/**
 * Postgres/Drizzle `AnalyticsEventStore` over `analytics_event`, shared by
 * `bff-api` and `bff-worker`. `createMany` is ONE multi-row INSERT statement,
 * which Postgres executes atomically: a failing row persists none of the
 * batch. Pending = `forwarded_at IS NULL`; the withdrawal cascade deletes only
 * pending rows, so already-forwarded rows are never touched.
 */
export function createPostgresAnalyticsEventStore(db: Db, now: () => Date = () => new Date()): AnalyticsEventStore {
  return {
    async create(input) {
      const [row] = await db.insert(analyticsEvent).values(toValues(input, now())).returning();
      if (!row) throw new Error("analytics_event insert returned no row");
      return toRecord(row);
    },

    async createMany(inputs) {
      if (inputs.length === 0) return [];
      const createdAt = now();
      const values = inputs.map((input) => toValues(input, createdAt));
      const rows = await db.insert(analyticsEvent).values(values).returning();
      return rows.sort((a, b) => a.seq - b.seq).map(toRecord);
    },

    async listPendingForward() {
      const rows = await db
        .select()
        .from(analyticsEvent)
        .where(isNull(analyticsEvent.forwardedAt))
        .orderBy(asc(analyticsEvent.seq));
      return rows.map(toRecord);
    },

    async markForwarded(ids, forwardedAt) {
      if (ids.length === 0) return;
      await db
        .update(analyticsEvent)
        .set({ forwardedAt: new Date(forwardedAt) })
        .where(inArray(analyticsEvent.id, ids));
    },

    async deletePendingByTripHash(tripHash) {
      const deleted = await db
        .delete(analyticsEvent)
        .where(and(eq(analyticsEvent.tripHash, tripHash), isNull(analyticsEvent.forwardedAt)))
        .returning({ id: analyticsEvent.id });
      return deleted.length;
    },

    async list() {
      const rows = await db.select().from(analyticsEvent).orderBy(asc(analyticsEvent.seq));
      return rows.map(toRecord);
    },
  };
}
