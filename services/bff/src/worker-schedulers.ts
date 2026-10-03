import type { Env } from "./config/env.js";
import type { QueueClient } from "./infra/queue/queue-client.js";
import { scheduleWifiOrderScans, WIFI_ENTITLEMENT_ACTIVATION_QUEUE } from "./modules/wifi-checkout/wifi-order-jobs.js";
import { scheduleAnalyticsForward, ANALYTICS_FORWARD_QUEUE } from "./modules/analytics/forward-analytics-events-job.js";
import { scheduleHandoffScans, PRECHECKIN_HANDOFF_QUEUE } from "./modules/precheckin/handoff-job.js";
import { schedulePrecheckinPurge, PRECHECKIN_PURGE_QUEUE } from "./modules/precheckin/purge-job.js";
import { scheduleJourneyPoll, JOURNEY_POLL_QUEUE } from "./modules/notifications/journey-poll-job.js";
import { schedulePushSubscriptionPurge, PUSH_SUBSCRIPTION_PURGE_QUEUE } from "./modules/notifications/purge-job.js";
import { scheduleStaffAlertDispatch, STAFF_ALERT_DISPATCH_QUEUE } from "./modules/pulse/dispatch-staff-alerts-job.js";
import { schedulePulsePurge, PULSE_PURGE_QUEUE } from "./modules/pulse/purge-job.js";

type IntervalEnv = Pick<
  Env,
  | "ANALYTICS_FORWARD_INTERVAL_SECONDS"
  | "PRECHECKIN_HANDOFF_INTERVAL_SECONDS"
  | "PRECHECKIN_PURGE_INTERVAL_SECONDS"
  | "JOURNEY_POLL_INTERVAL_SECONDS"
  | "PUSH_SUBSCRIPTION_PURGE_INTERVAL_SECONDS"
  | "STAFF_ALERT_DISPATCH_INTERVAL_SECONDS"
  | "PULSE_PURGE_INTERVAL_SECONDS"
>;

/**
 * The scan jobs only run when something enqueues them; nothing else does, so the
 * worker schedules every periodic scan whose queue was actually registered
 * (`sample-job` is a test fixture and is never scheduled). Returns every stop
 * function so the shutdown handler can stop all of them.
 */
export function scheduleWorkerScans(
  queueClient: Pick<QueueClient, "sendIdempotent">,
  jobsRegistered: readonly string[],
  env: IntervalEnv,
): Array<() => void> {
  const stops: Array<() => void> = [];
  const when = (queue: string, schedule: () => () => void): void => {
    if (jobsRegistered.includes(queue)) stops.push(schedule());
  };
  const ms = (seconds: number): { intervalMs: number } => ({ intervalMs: seconds * 1000 });

  when(WIFI_ENTITLEMENT_ACTIVATION_QUEUE, () => scheduleWifiOrderScans(queueClient));
  when(ANALYTICS_FORWARD_QUEUE, () => scheduleAnalyticsForward(queueClient, ms(env.ANALYTICS_FORWARD_INTERVAL_SECONDS)));
  when(PRECHECKIN_HANDOFF_QUEUE, () => scheduleHandoffScans(queueClient, ms(env.PRECHECKIN_HANDOFF_INTERVAL_SECONDS)));
  when(PRECHECKIN_PURGE_QUEUE, () => schedulePrecheckinPurge(queueClient, ms(env.PRECHECKIN_PURGE_INTERVAL_SECONDS)));
  when(JOURNEY_POLL_QUEUE, () => scheduleJourneyPoll(queueClient, ms(env.JOURNEY_POLL_INTERVAL_SECONDS)));
  when(PUSH_SUBSCRIPTION_PURGE_QUEUE, () =>
    schedulePushSubscriptionPurge(queueClient, ms(env.PUSH_SUBSCRIPTION_PURGE_INTERVAL_SECONDS)),
  );
  when(STAFF_ALERT_DISPATCH_QUEUE, () => scheduleStaffAlertDispatch(queueClient, ms(env.STAFF_ALERT_DISPATCH_INTERVAL_SECONDS)));
  when(PULSE_PURGE_QUEUE, () => schedulePulsePurge(queueClient, ms(env.PULSE_PURGE_INTERVAL_SECONDS)));
  return stops;
}
