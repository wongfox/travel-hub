import type { ApiClient } from "../api/client.js";
import { listQueuedAnalyticsEvents, removeQueuedAnalyticsEvents, type QueuedAnalyticsEvent } from "./analytics-queue-store.js";

export interface FlushAnalyticsQueueDeps {
  apiClient: ApiClient;
  /**
   * Injectable seam for deterministic tests and non-beacon environments;
   * defaults to the real `navigator.sendBeacon` when available. Returning
   * `false` (or throwing) falls back to `apiClient.post`.
   */
  sendBeacon?: (url: string, body: Blob) => boolean;
}

export interface FlushAnalyticsQueueResult {
  sent: number;
  /** `true` when nothing was queued — distinguishes a no-op flush from one that actually sent events. */
  skipped: boolean;
}

/** Mirrors `SendAnalyticsEventsRequestSchema`'s `events.max(50)` (contracts/analytics.ts) exactly. */
const MAX_EVENTS_PER_REQUEST = 50;

function toWirePayload(events: QueuedAnalyticsEvent[]): { events: { name: string; occurredAt: string; props?: Record<string, unknown> }[] } {
  return {
    events: events.map((event) => ({
      name: event.name,
      occurredAt: event.occurredAt,
      ...(event.props ? { props: event.props } : {}),
    })),
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Sends every currently queued event to `POST /api/events` (task 12.1), in
 * batches of at most `MAX_EVENTS_PER_REQUEST` (the server's own bound — an
 * oversized single request would be rejected, and clearing the queue
 * regardless would silently drop every event past the limit), removing each
 * batch from the queue ONLY after a send that the caller can be reasonably
 * confident succeeded — never before, so a failed/lost send leaves that
 * batch's events queued for the next flush attempt instead of silently
 * dropping them. A later batch's failure never discards an earlier batch's
 * already-confirmed removal.
 *
 * Prefers `navigator.sendBeacon` (fire-and-forget, survives page unload —
 * the whole reason `sendBeacon` exists) when available; `sendBeacon`'s
 * return value only indicates the browser ACCEPTED the request for
 * best-effort delivery, not that the server received it, so each batch's
 * queue entries are cleared optimistically in that path (consistent with how
 * every other `sendBeacon` integration behaves — there is no delivery
 * receipt to wait for). Falls back to the ordinary `apiClient.post`, awaiting
 * its actual response before clearing that batch, when `sendBeacon` is
 * unavailable or returns `false`.
 */
export async function flushAnalyticsQueue(deps: FlushAnalyticsQueueDeps): Promise<FlushAnalyticsQueueResult> {
  const queued = await listQueuedAnalyticsEvents();
  if (queued.length === 0) {
    return { sent: 0, skipped: true };
  }

  const sendBeacon =
    deps.sendBeacon ??
    (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function"
      ? navigator.sendBeacon.bind(navigator)
      : undefined);

  let sent = 0;
  for (const batch of chunk(queued, MAX_EVENTS_PER_REQUEST)) {
    const ids = batch.map((event) => event.id);
    const payload = toWirePayload(batch);

    if (sendBeacon) {
      const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      const accepted = sendBeacon("/api/events", blob);
      if (accepted) {
        await removeQueuedAnalyticsEvents(ids);
        sent += batch.length;
        continue;
      }
    }

    await deps.apiClient.post("/api/events", payload);
    await removeQueuedAnalyticsEvents(ids);
    sent += batch.length;
  }

  return { sent, skipped: false };
}
