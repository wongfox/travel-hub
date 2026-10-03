import { afterEach, describe, expect, it, vi } from "vitest";
import { scheduleQueueScans } from "./schedule-queue-scans.js";

describe("scheduleQueueScans", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends an idempotent 'scan' to every queue on each tick, never before the first tick, and stops when asked", async () => {
    vi.useFakeTimers();
    const sent: Array<[string, string]> = [];
    const queueClient = {
      async sendIdempotent(queue: string, key: string) {
        sent.push([queue, key]);
        return null;
      },
    };

    const stop = scheduleQueueScans(queueClient as never, ["a", "b"], { intervalMs: 1000 });
    expect(sent).toEqual([]);

    await vi.advanceTimersByTimeAsync(1000);
    expect(sent).toEqual([["a", "scan"], ["b", "scan"]]);

    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(sent).toHaveLength(2);
  });

  it("logs a failed send through the injected logger and keeps ticking", async () => {
    vi.useFakeTimers();
    const logger = vi.fn();
    const queueClient = {
      async sendIdempotent() {
        throw new Error("queue down");
      },
    };

    const stop = scheduleQueueScans(queueClient as never, ["a"], { intervalMs: 1000, logger });
    await vi.advanceTimersByTimeAsync(2000);
    stop();

    expect(logger).toHaveBeenCalledTimes(2);
    expect(logger.mock.calls[0]?.[0]).toContain("a");
  });

  it("rejects a non-positive interval instead of spinning", () => {
    expect(() => scheduleQueueScans({ sendIdempotent: async () => null } as never, ["a"], { intervalMs: 0 })).toThrow();
  });
});
