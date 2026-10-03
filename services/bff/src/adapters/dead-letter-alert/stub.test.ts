import { describe, expect, it } from "vitest";
import { createDeadLetterAlertStub } from "./stub.js";

const ALERT = {
  queueName: "queue-a",
  deadLetterQueueName: "queue-a-dead-letter",
  count: 1,
  detectedAt: "2026-01-01T00:00:00.000Z",
};

describe("createDeadLetterAlertStub", () => {
  it("records every notified alert, in call order", async () => {
    const stub = createDeadLetterAlertStub();

    await stub.notify(ALERT);

    expect(stub.notifications).toEqual([ALERT]);
  });

  it("simulateFailureOnce makes the next notify() reject once, then succeed normally", async () => {
    const stub = createDeadLetterAlertStub();
    stub.simulateFailureOnce();

    await expect(stub.notify(ALERT)).rejects.toThrow();
    await expect(stub.notify(ALERT)).resolves.toBeUndefined();
    expect(stub.notifications).toEqual([ALERT]);
  });
});
