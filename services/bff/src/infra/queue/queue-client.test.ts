import { describe, expect, it } from "vitest";
import { createInMemoryQueueClient } from "./queue-client.js";

describe("createInMemoryQueueClient", () => {
  it("runs a job exactly once even when the same natural key is sent twice before it completes", async () => {
    const client = createInMemoryQueueClient();
    await client.createQueue("sample-job", { retryLimit: 2, retryBackoffSeconds: 1 });

    const executions: string[] = [];
    await client.work<{ message: string }>("sample-job", async (payload) => {
      executions.push(payload.message);
    });

    const firstId = await client.sendIdempotent("sample-job", "natural-key-1", {
      message: "first send",
    });
    const secondId = await client.sendIdempotent("sample-job", "natural-key-1", {
      message: "second send (duplicate)",
    });

    expect(firstId).not.toBeNull();
    expect(secondId).toBeNull();

    await client.runPendingOnce("sample-job");

    expect(executions).toEqual(["first send"]);
  });

  it("moves a job to the dead-letter queue once retries are exhausted, and allows the natural key to be re-sent afterward", async () => {
    const client = createInMemoryQueueClient();
    await client.createQueue("flaky-job", {
      retryLimit: 2,
      retryBackoffSeconds: 1,
      deadLetterQueue: "flaky-job-dead-letter",
    });

    let attempts = 0;
    await client.work<{ message: string }>("flaky-job", async () => {
      attempts += 1;
      throw new Error("simulated downstream failure");
    });

    await client.sendIdempotent("flaky-job", "natural-key-2", { message: "will always fail" });

    // Attempt 1 (initial) + 2 retries = 3 total attempts before exhaustion.
    await client.runPendingOnce("flaky-job");
    await client.runPendingOnce("flaky-job");
    await client.runPendingOnce("flaky-job");

    expect(attempts).toBe(3);
    expect(client.peekDeadLetters("flaky-job-dead-letter")).toEqual([
      { message: "will always fail" },
    ]);

    // Running again attempts nothing further — the job left the pending set.
    await client.runPendingOnce("flaky-job");
    expect(attempts).toBe(3);

    // The natural key is free again since the exhausted job is no longer pending.
    const idAfterExhaustion = await client.sendIdempotent("flaky-job", "natural-key-2", {
      message: "retry after dead-letter",
    });
    expect(idAfterExhaustion).not.toBeNull();
  });
});
