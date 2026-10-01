import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { registerObservabilityRoutes } from "./http.js";
import type { KnownQueue } from "./known-queues.js";

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

describe("registerObservabilityRoutes", () => {
  it("responds 200 on GET /metrics with depth and dead-letter count for every known queue", async () => {
    const app = Fastify();
    const knownQueues: KnownQueue[] = [{ queueName: "sample-job", deadLetterQueueName: "sample-job-dead-letter" }];
    registerObservabilityRoutes(app, {
      queueClient: fakeQueueClient({ "sample-job": 2 }, { "sample-job-dead-letter": 1 }),
      knownQueues,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    });

    const response = await app.inject({ method: "GET", url: "/metrics" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      generatedAt: "2026-01-01T00:00:00.000Z",
      queues: [{ queueName: "sample-job", depth: 2, deadLetterQueueName: "sample-job-dead-letter", deadLetterCount: 1 }],
    });
  });

  it("notifies the configured DeadLetterAlertPort when a queue's dead-letter count is greater than zero", async () => {
    const app = Fastify();
    const notify = vi.fn().mockResolvedValue(undefined);
    registerObservabilityRoutes(app, {
      queueClient: fakeQueueClient({ "sample-job": 0 }, { "sample-job-dead-letter": 1 }),
      knownQueues: [{ queueName: "sample-job", deadLetterQueueName: "sample-job-dead-letter" }],
      deadLetterAlert: { notify },
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    });

    await app.inject({ method: "GET", url: "/metrics" });

    expect(notify).toHaveBeenCalledWith({
      queueName: "sample-job",
      deadLetterQueueName: "sample-job-dead-letter",
      count: 1,
      detectedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("still responds 200 when the DeadLetterAlertPort rejects (best-effort, never breaks /metrics)", async () => {
    const app = Fastify();
    registerObservabilityRoutes(app, {
      queueClient: fakeQueueClient({}, { "sample-job-dead-letter": 1 }),
      knownQueues: [{ queueName: "sample-job", deadLetterQueueName: "sample-job-dead-letter" }],
      deadLetterAlert: { notify: vi.fn().mockRejectedValue(new Error("simulated failure")) },
    });

    const response = await app.inject({ method: "GET", url: "/metrics" });

    expect(response.statusCode).toBe(200);
  });

  it("surfaces a 500 (never a silent partial report) when the queueClient itself rejects", async () => {
    const app = Fastify();
    registerObservabilityRoutes(app, {
      queueClient: {
        async getQueueDepth() {
          throw new Error("simulated queue-store outage");
        },
        async getDeadLetterCount() {
          return 0;
        },
      },
      knownQueues: [{ queueName: "sample-job" }],
    });

    const response = await app.inject({ method: "GET", url: "/metrics" });

    expect(response.statusCode).toBe(500);
  });

  it("does not notify when every dead-letter count is zero", async () => {
    const app = Fastify();
    const notify = vi.fn().mockResolvedValue(undefined);
    registerObservabilityRoutes(app, {
      queueClient: fakeQueueClient({ "sample-job": 0 }, { "sample-job-dead-letter": 0 }),
      knownQueues: [{ queueName: "sample-job", deadLetterQueueName: "sample-job-dead-letter" }],
      deadLetterAlert: { notify },
    });

    await app.inject({ method: "GET", url: "/metrics" });

    expect(notify).not.toHaveBeenCalled();
  });
});
