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

/** Sends in ≤`MAX_EVENTS_PER_REQUEST`-event batches (R3-001), removing each only after a send it can trust succeeded. */
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
  for (let i = 0; i < queued.length; i += MAX_EVENTS_PER_REQUEST) {
    const batch = queued.slice(i, i + MAX_EVENTS_PER_REQUEST);
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
