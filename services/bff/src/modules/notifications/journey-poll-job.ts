import type { AlertSourcePolicy } from "contracts";
import type { QueueClient, QueueRetryPolicy } from "../../infra/queue/queue-client.js";
import { dispatchJourneyEvents } from "./dispatch-journey-events.js";
import type { JourneyEventSourcePort, NotificationStore, PushSubscriptionStore, WebPushPort } from "./ports.js";
import { scheduleQueueScans } from "../../infra/queue/schedule-queue-scans.js";

/** Worker queue this module registers on (task 11.2), following `registerHandoffJob`/`registerWifiOrderJobs`'s exact `registerXxxJob(queueClient, deps)` convention. */
export const JOURNEY_POLL_QUEUE = "journey-poll";
export const JOURNEY_POLL_RETRY_POLICY: QueueRetryPolicy = { retryLimit: 3, retryBackoffSeconds: 30 };

export interface JourneyPollJobDeps {
  journeyEventSource: JourneyEventSourcePort;
  notificationStore: NotificationStore;
  subscriptionStore: Pick<PushSubscriptionStore, "findActiveByReservation" | "deleteById">;
  webPush: WebPushPort;
  alertSourcePolicy: AlertSourcePolicy;
  /** "Near-term departures" window width (design Decision 11: "trips departing in the next N hours"), configurable. */
  pollWindowHours: number;
  /** Injectable clock for deterministic tests; defaults to `Date.now`. */
  now?: () => Date;
}

/**
 * Polls `JourneyEventSourcePort` for events on trips departing within the
 * next `pollWindowHours` and hands them to `dispatchJourneyEvents` (task
 * 11.2). One scan per trigger, same "natural-key dedupe keeps only one scan
 * in flight" convention as `registerHandoffJob`/`registerWifiOrderJobs`.
 */
export async function runJourneyPollJob(deps: JourneyPollJobDeps): Promise<ReturnType<typeof dispatchJourneyEvents>> {
  const now = deps.now ? deps.now() : new Date();
  const to = new Date(now.getTime() + deps.pollWindowHours * 60 * 60 * 1000);
  const events = await deps.journeyEventSource.pollActive({ from: now, to });

  return dispatchJourneyEvents(events, {
    notificationStore: deps.notificationStore,
    subscriptionStore: deps.subscriptionStore,
    webPush: deps.webPush,
    alertSourcePolicy: deps.alertSourcePolicy,
  });
}

/** Registers the journey-poll job on `queueClient`'s worker process (task 11.2). */
export async function registerJourneyPollJob(queueClient: QueueClient, deps: JourneyPollJobDeps): Promise<void> {
  await queueClient.createQueue(JOURNEY_POLL_QUEUE, JOURNEY_POLL_RETRY_POLICY);
  await queueClient.work(JOURNEY_POLL_QUEUE, async () => {
    await runJourneyPollJob(deps);
  });
}

/** Default cadence of the journey poll (60s); overridden by the env-driven interval in `main-worker.ts`. */
export const JOURNEY_POLL_INTERVAL_MS = 60_000;

/**
 * Periodically enqueues the journey poll on the worker process (nothing else does).
 * Delegates to `scheduleQueueScans`: idempotent natural key, logged send
 * failures retried next tick, returns a stop function.
 */
export function scheduleJourneyPoll(
  queueClient: Pick<QueueClient, "sendIdempotent">,
  options: { intervalMs?: number } = {},
): () => void {
  return scheduleQueueScans(queueClient, [JOURNEY_POLL_QUEUE], { intervalMs: options.intervalMs ?? JOURNEY_POLL_INTERVAL_MS });
}
