import { describe, expect, it, vi } from "vitest";
import { buildMetricsReport, evaluateDeadLetterAlerts, notifyDeadLetterAlertsBestEffort } from "./metrics.js";
import type { KnownQueue } from "./known-queues.js";
import type { DeadLetterAlertPort } from "./ports.js";

function fakeQueueClient(depths: Record<string, number>, deadLetterCounts: Record<string, number>) {
  return {
    async getQueueDepth(queueName: string) {
      return depths[queueName] ?? 0;
    },
    async getDeadLetterCount(deadLetterQueueName: string) {
      return deadLetterCounts[deadLetterQueueName] ?? 0;
    },
  };
}

describe("buildMetricsReport", () => {
  it("reports depth for every known queue, and dead-letter count only for queues that declare one", async () => {
    const knownQueues: KnownQueue[] = [
      { queueName: "queue-a", deadLetterQueueName: "queue-a-dead-letter" },
      { queueName: "queue-b" },
    ];
    const queueClient = fakeQueueClient(
      { "queue-a": 3, "queue-b": 0 },
      { "queue-a-dead-letter": 1 },
    );

    const report = await buildMetricsReport(queueClient, knownQueues, () => new Date("2026-01-01T00:00:00.000Z"));

    expect(report.generatedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(report.queues).toEqual([
      { queueName: "queue-a", depth: 3, deadLetterQueueName: "queue-a-dead-letter", deadLetterCount: 1 },
      { queueName: "queue-b", depth: 0 },
    ]);
  });

  it("reports zero for every queue against a client that has never seen any of them", async () => {
    const knownQueues: KnownQueue[] = [{ queueName: "unused-queue" }];
    const queueClient = fakeQueueClient({}, {});

    const report = await buildMetricsReport(queueClient, knownQueues);

    expect(report.queues).toEqual([{ queueName: "unused-queue", depth: 0 }]);
  });
});

describe("evaluateDeadLetterAlerts", () => {
  it("raises one alert per queue whose dead-letter count is greater than zero", () => {
    const alerts = evaluateDeadLetterAlerts(
      {
        generatedAt: "2026-01-01T00:00:00.000Z",
        queues: [
          { queueName: "queue-a", depth: 3, deadLetterQueueName: "queue-a-dead-letter", deadLetterCount: 1 },
          { queueName: "queue-b", depth: 0, deadLetterQueueName: "queue-b-dead-letter", deadLetterCount: 0 },
          { queueName: "queue-c", depth: 2 },
        ],
      },
    );

    expect(alerts).toEqual([
      {
        queueName: "queue-a",
        deadLetterQueueName: "queue-a-dead-letter",
        count: 1,
        detectedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });

  it("raises no alerts when every dead-letter count is zero or absent", () => {
    const alerts = evaluateDeadLetterAlerts({
      generatedAt: "2026-01-01T00:00:00.000Z",
      queues: [{ queueName: "queue-a", depth: 0 }],
    });

    expect(alerts).toEqual([]);
  });
});

describe("notifyDeadLetterAlertsBestEffort", () => {
  const alert = {
    queueName: "queue-a",
    deadLetterQueueName: "queue-a-dead-letter",
    count: 1,
    detectedAt: "2026-01-01T00:00:00.000Z",
  };

  it("calls notify for every alert when a port is given", async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    const port: DeadLetterAlertPort = { notify };

    await notifyDeadLetterAlertsBestEffort(port, [alert]);

    expect(notify).toHaveBeenCalledWith(alert);
  });

  it("does nothing when no port is given (backward compatible, same convention as recordAnalyticsBestEffort)", async () => {
    await expect(notifyDeadLetterAlertsBestEffort(undefined, [alert])).resolves.toBeUndefined();
  });

  it("swallows a notify failure instead of throwing (alerting must never break the metrics endpoint)", async () => {
    const port: DeadLetterAlertPort = { notify: vi.fn().mockRejectedValue(new Error("simulated failure")) };

    await expect(notifyDeadLetterAlertsBestEffort(port, [alert])).resolves.toBeUndefined();
  });
});
