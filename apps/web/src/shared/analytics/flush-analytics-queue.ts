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

function toWirePayload(events: QueuedAnalyticsEvent[]): { events: { name: string; occurredAt: string; props?: Record<string, unknown> }[] } {
  return {
    events: events.map((event) => ({
      name: event.name,
      occurredAt: event.occurredAt,
      ...(event.props ? { props: event.props } : {}),
    })),
  };
}

/**
 * Sends every currently queued event to `POST /api/events` (task 12.1) and
 * removes them from the queue ONLY after a send that the caller can be
 * reasonably confident succeeded — never before, so a failed/lost send
 * leaves the event queued for the next flush attempt instead of silently
 * dropping it.
 *
 * Prefers `navigator.sendBeacon` (fire-and-forget, survives page unload —
 * the whole reason `sendBeacon` exists) when available; `sendBeacon`'s
 * return value only indicates the browser ACCEPTED the request for
 * best-effort delivery, not that the server received it, so the queue is
 * cleared optimistically in that path (consistent with how every other
 * `sendBeacon` integration behaves — there is no delivery receipt to wait
 * for). Falls back to the ordinary `apiClient.post`, awaiting its actual
 * response before clearing anything, when `sendBeacon` is unavailable or
 * returns `false`.
 */
export async function flushAnalyticsQueue(deps: FlushAnalyticsQueueDeps): Promise<FlushAnalyticsQueueResult> {
  const queued = await listQueuedAnalyticsEvents();
  if (queued.length === 0) {
    return { sent: 0, skipped: true };
  }

  const ids = queued.map((event) => event.id);
  const payload = toWirePayload(queued);

  const sendBeacon =
    deps.sendBeacon ??
    (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function"
      ? navigator.sendBeacon.bind(navigator)
      : undefined);

  if (sendBeacon) {
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    const accepted = sendBeacon("/api/events", blob);
    if (accepted) {
      await removeQueuedAnalyticsEvents(ids);
      return { sent: queued.length, skipped: false };
    }
  }

  await deps.apiClient.post("/api/events", payload);
  await removeQueuedAnalyticsEvents(ids);
  return { sent: queued.length, skipped: false };
}
