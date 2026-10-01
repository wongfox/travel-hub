import type { FastifyInstance } from "fastify";
import type { QueueClient } from "../../infra/queue/queue-client.js";
import { KNOWN_QUEUES, type KnownQueue } from "./known-queues.js";
import { buildMetricsReport, evaluateDeadLetterAlerts, notifyDeadLetterAlertsBestEffort } from "./metrics.js";
import type { DeadLetterAlertPort } from "./ports.js";

export interface ObservabilityRouteDeps {
  queueClient: Pick<QueueClient, "getQueueDepth" | "getDeadLetterCount">;
  /** Defaults to the full registry (`known-queues.ts`); overridable for tests. */
  knownQueues?: readonly KnownQueue[];
  /** Best-effort "alerting hook for dead-letter jobs" (task 13.3); omitted entirely, `/metrics` still reports dead-letter counts, it just never notifies anything. */
  deadLetterAlert?: Pick<DeadLetterAlertPort, "notify">;
  /** Injectable clock for deterministic tests; defaults to `Date.now`. */
  now?: () => Date;
}

/**
 * Registers `GET /metrics` (task 13.3, beyond the existing `GET /healthz`):
 * reports job-queue depth and dead-letter count. Best-effort notifies
 * `deadLetterAlert` for any queue whose dead-letter count is greater than
 * zero — never fails the response itself (`notifyDeadLetterAlertsBestEffort`
 * swallows a notify failure, same "never block the action it instruments"
 * convention as `recordAnalyticsBestEffort`).
 */
export function registerObservabilityRoutes(app: FastifyInstance, deps: ObservabilityRouteDeps): void {
  const knownQueues = deps.knownQueues ?? KNOWN_QUEUES;

  app.get("/metrics", async () => {
    const report = await buildMetricsReport(deps.queueClient, knownQueues, deps.now);
    const alerts = evaluateDeadLetterAlerts(report);
    await notifyDeadLetterAlertsBestEffort(deps.deadLetterAlert, alerts);
    return report;
  });
}
