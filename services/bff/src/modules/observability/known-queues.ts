import { SAMPLE_JOB_DEAD_LETTER_QUEUE, SAMPLE_JOB_QUEUE } from "../../infra/queue/sample-job.js";
import { PRECHECKIN_HANDOFF_QUEUE } from "../precheckin/handoff-job.js";
import { PRECHECKIN_PURGE_QUEUE } from "../precheckin/purge-job.js";
import { WIFI_ENTITLEMENT_ACTIVATION_QUEUE, WIFI_SIR_RECEIPT_QUEUE } from "../wifi-checkout/wifi-order-jobs.js";
import { JOURNEY_POLL_QUEUE } from "../notifications/journey-poll-job.js";
import { PUSH_SUBSCRIPTION_PURGE_QUEUE } from "../notifications/purge-job.js";
import { STAFF_ALERT_DISPATCH_QUEUE } from "../pulse/dispatch-staff-alerts-job.js";
import { PULSE_PURGE_QUEUE } from "../pulse/purge-job.js";
import { ANALYTICS_FORWARD_QUEUE } from "../analytics/forward-analytics-events-job.js";

export interface KnownQueue {
  queueName: string;
  /** Only present for a queue whose `QueueRetryPolicy` declares a `deadLetterQueue` (task 3.4's convention). */
  deadLetterQueueName?: string;
}

/**
 * The full registry of queues the `worker` process may register (every
 * `registerXxxJob` call site across `composition-root.ts`'s `startWorker`),
 * used by `GET /metrics` (task 13.3) to report depth for every queue and a
 * dead-letter count for whichever ones declare a dead-letter queue.
 *
 * Only `sample-job` (task 3.4) currently declares a `deadLetterQueue` in its
 * retry policy — every other job's `QueueRetryPolicy` omits one today (a
 * pre-existing gap from earlier work units, not introduced here), so those
 * queues report depth only. Extending any of them with their own
 * `deadLetterQueue` is a mechanical follow-up: add the constant + retry
 * policy field + `createQueue` call (mirroring `registerSampleJob`), then add
 * its `deadLetterQueueName` to the matching entry below.
 */
export const KNOWN_QUEUES: readonly KnownQueue[] = [
  { queueName: SAMPLE_JOB_QUEUE, deadLetterQueueName: SAMPLE_JOB_DEAD_LETTER_QUEUE },
  { queueName: PRECHECKIN_HANDOFF_QUEUE },
  { queueName: PRECHECKIN_PURGE_QUEUE },
  { queueName: WIFI_ENTITLEMENT_ACTIVATION_QUEUE },
  { queueName: WIFI_SIR_RECEIPT_QUEUE },
  { queueName: JOURNEY_POLL_QUEUE },
  { queueName: PUSH_SUBSCRIPTION_PURGE_QUEUE },
  { queueName: STAFF_ALERT_DISPATCH_QUEUE },
  { queueName: PULSE_PURGE_QUEUE },
  { queueName: ANALYTICS_FORWARD_QUEUE },
];
