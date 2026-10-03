import type { AnalyticsEventName } from "contracts";
import { ANALYTICS_QUEUE_STORE, getTravelHubDb } from "../offline/travelhub-db.js";

/** One queued, not-yet-sent analytics event (task 12.1, design Data Model "Client-side": IndexedDB `analyticsQueue`). */
export interface QueuedAnalyticsEvent {
  id: string;
  name: AnalyticsEventName;
  occurredAt: string;
  props?: Record<string, unknown>;
}

export interface EnqueueAnalyticsEventInput {
  name: AnalyticsEventName;
  props?: Record<string, unknown>;
}

/**
 * Appends one event to the offline queue (task 12.1's "offline-queued"
 * requirement): a passenger with no network connectivity can still track
 * interactions; `flushAnalyticsQueue` sends them once connectivity (or a
 * page-unload opportunity) is available. `trackEvent` (the consent-gated
 * entry point every call site should actually use) wraps this.
 */
export async function enqueueAnalyticsEvent(input: EnqueueAnalyticsEventInput): Promise<QueuedAnalyticsEvent> {
  const record: QueuedAnalyticsEvent = {
    id: crypto.randomUUID(),
    name: input.name,
    occurredAt: new Date().toISOString(),
    ...(input.props ? { props: input.props } : {}),
  };
  const db = await getTravelHubDb();
  await db.put(ANALYTICS_QUEUE_STORE, record);
  return record;
}

/**
 * Every currently queued event, ordered by `occurredAt` (`flushAnalyticsQueue`'s
 * own read, and test introspection). Sorted explicitly rather than relying
 * on `getAll()`'s iteration order: this store's primary key is each record's
 * own UUID `id` (needed so `removeQueuedAnalyticsEvents` can target
 * individual rows), and IndexedDB iterates an object store in primary-key
 * order, NOT insertion order — a lexicographically-earlier UUID enqueued
 * later would otherwise sort before an earlier, lexicographically-later one.
 */
export async function listQueuedAnalyticsEvents(): Promise<QueuedAnalyticsEvent[]> {
  const db = await getTravelHubDb();
  const all = (await db.getAll(ANALYTICS_QUEUE_STORE)) as QueuedAnalyticsEvent[];
  return [...all].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

/** Removes the given queued events by id (called by `flushAnalyticsQueue` after a successful send — never before). */
export async function removeQueuedAnalyticsEvents(ids: string[]): Promise<void> {
  const db = await getTravelHubDb();
  const tx = db.transaction(ANALYTICS_QUEUE_STORE, "readwrite");
  await Promise.all(ids.map((id) => tx.store.delete(id)));
  await tx.done;
}
