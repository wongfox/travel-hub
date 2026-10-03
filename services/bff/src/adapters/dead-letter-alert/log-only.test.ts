import { describe, expect, it, vi } from "vitest";
import { createDeadLetterAlertLogOnlyAdapter } from "./log-only.js";

const ALERT = {
  queueName: "queue-a",
  deadLetterQueueName: "queue-a-dead-letter",
  count: 1,
  detectedAt: "2026-01-01T00:00:00.000Z",
};

describe("createDeadLetterAlertLogOnlyAdapter", () => {
  it("logs the alert via the injected logger and resolves", async () => {
    const log = vi.fn();
    const adapter = createDeadLetterAlertLogOnlyAdapter({ log });

    await expect(adapter.notify(ALERT)).resolves.toBeUndefined();

    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(expect.objectContaining(ALERT));
  });
});
