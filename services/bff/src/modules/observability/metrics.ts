import type { QueueClient } from "../../infra/queue/queue-client.js";
import type { KnownQueue } from "./known-queues.js";
import type { DeadLetterAlert, DeadLetterAlertPort } from "./ports.js";

export interface QueueMetric {
  queueName: string;
  depth: number;
  /** Present only for a queue whose `KnownQueue` entry declares a `deadLetterQueueName`. */
  deadLetterQueueName?: string;
  deadLetterCount?: number;
}

export interface MetricsReport {
  generatedAt: string;
  queues: QueueMetric[];
}

/**
 * Builds the `GET /metrics` report (task 13.3): depth for every known queue,
 * plus dead-letter count for whichever ones declare a dead-letter queue
 * (`known-queues.ts`'s registry). `queueClient` is read-only here — this
 * never calls `sendIdempotent`/`work`, only the two observability methods
 * (`infra/queue/queue-client.ts`).
 */
export async function buildMetricsReport(
  queueClient: Pick<QueueClient, "getQueueDepth" | "getDeadLetterCount">,
  knownQueues: readonly KnownQueue[],
  now: () => Date = () => new Date(),
): Promise<MetricsReport> {
  const queues = await Promise.all(
    knownQueues.map(async (known): Promise<QueueMetric> => {
      const depth = await queueClient.getQueueDepth(known.queueName);
      if (!known.deadLetterQueueName) {
        return { queueName: known.queueName, depth };
      }
      const deadLetterCount = await queueClient.getDeadLetterCount(known.deadLetterQueueName);
      return {
        queueName: known.queueName,
        depth,
        deadLetterQueueName: known.deadLetterQueueName,
        deadLetterCount,
      };
    }),
  );

  return { generatedAt: now().toISOString(), queues };
}

/**
 * Raises one `DeadLetterAlert` per queue in `report` whose dead-letter count
 * is greater than zero — the "alerting hook for dead-letter jobs" task 13.3
 * asks for. A queue with no declared dead-letter queue, or a dead-letter
 * count of exactly zero, never raises an alert.
 */
export function evaluateDeadLetterAlerts(report: MetricsReport): DeadLetterAlert[] {
  return report.queues
    .filter((queue) => (queue.deadLetterCount ?? 0) > 0)
    .map((queue) => ({
      queueName: queue.queueName,
      // Guarded by the filter above: a positive `deadLetterCount` only
      // exists on a queue that also has `deadLetterQueueName` set (see
      // `buildMetricsReport`).
      deadLetterQueueName: queue.deadLetterQueueName as string,
      count: queue.deadLetterCount as number,
      detectedAt: report.generatedAt,
    }));
}

/**
 * Awaits `port.notify(alert)` for every alert and swallows any failure:
 * alerting must never fail (or delay-fail) the `/metrics` response it is
 * attached to — same "never block the action it instruments" principle as
 * `recordAnalyticsBestEffort` (`modules/analytics/analytics-recorder.ts`).
 * `port` is optional so `/metrics` stays usable with no alerting adapter
 * wired in at all (defaults to reporting metrics only, no alert dispatch).
 */
export async function notifyDeadLetterAlertsBestEffort(
  port: Pick<DeadLetterAlertPort, "notify"> | undefined,
  alerts: DeadLetterAlert[],
): Promise<void> {
  if (!port) return;
  await Promise.all(
    alerts.map(async (alert) => {
      try {
        await port.notify(alert);
      } catch {
        // Swallowed intentionally — see doc comment above.
      }
    }),
  );
}
