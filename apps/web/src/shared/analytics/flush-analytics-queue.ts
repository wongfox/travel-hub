import { ApiError, UnparsableApiError, type ApiClient } from "../api/client.js";
import { hasAnalyticsConsentGranted } from "./analytics-consent.js";
import { clearQueuedAnalyticsEvents, listQueuedAnalyticsEvents, removeQueuedAnalyticsEvents, type QueuedAnalyticsEvent } from "./analytics-queue-store.js";

export interface FlushAnalyticsQueueDeps {
  apiClient: ApiClient;
}

export interface FlushAnalyticsQueueResult {
  sent: number;
  /** Events discarded because the server permanently rejected their batch (a 4xx other than 408/429), so it can never block later events. */
  dropped: number;
  /** `true` when nothing was queued or sent — distinguishes a no-op flush from one that actually sent events. */
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

/** A 4xx the server will keep rejecting no matter how often it is retried; 408 (timeout) and 429 (rate limit) are transient. */
function isPermanentRejection(error: unknown): boolean {
  if (!(error instanceof ApiError) && !(error instanceof UnparsableApiError)) return false;
  return error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429;
}

/**
 * Sends in ≤`MAX_EVENTS_PER_REQUEST`-event batches (R3-001), removing each
 * only after a response it can observe: `fetch` with `keepalive` (survives
 * page unload) instead of `navigator.sendBeacon`, whose `true` only means
 * "queued by the browser" and would delete rows that may never arrive.
 * A permanently rejected batch (4xx other than 408/429) is dropped so it
 * cannot stall every later flush; transient failures (5xx, network, 408,
 * 429) rethrow and keep the queue. Consent is re-checked first: without it
 * nothing is sent and the queue is discarded.
 */
export async function flushAnalyticsQueue(deps: FlushAnalyticsQueueDeps): Promise<FlushAnalyticsQueueResult> {
  if (!hasAnalyticsConsentGranted()) {
    await clearQueuedAnalyticsEvents();
    return { sent: 0, dropped: 0, skipped: true };
  }

  const queued = await listQueuedAnalyticsEvents();
  if (queued.length === 0) {
    return { sent: 0, dropped: 0, skipped: true };
  }

  let sent = 0;
  let dropped = 0;
  for (let i = 0; i < queued.length; i += MAX_EVENTS_PER_REQUEST) {
    if (!hasAnalyticsConsentGranted()) {
      await clearQueuedAnalyticsEvents();
      break;
    }
    const batch = queued.slice(i, i + MAX_EVENTS_PER_REQUEST);
    const ids = batch.map((event) => event.id);

    try {
      await deps.apiClient.post("/api/events", toWirePayload(batch), { keepalive: true });
      sent += batch.length;
    } catch (error) {
      if (!isPermanentRejection(error)) throw error;
      dropped += batch.length;
    }
    await removeQueuedAnalyticsEvents(ids);
  }

  return { sent, dropped, skipped: false };
}
