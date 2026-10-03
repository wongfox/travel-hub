import { describe, expect, it } from "vitest";
import { createInMemoryQueueClient } from "./queue-client.js";
import {
  SAMPLE_JOB_DEAD_LETTER_QUEUE,
  SAMPLE_JOB_QUEUE,
  registerSampleJob,
} from "./sample-job.js";

describe("registerSampleJob", () => {
  it("wires the sample job onto the given queue client with a bounded retry policy and dead-letter queue", async () => {
    const client = createInMemoryQueueClient();
    const executed: string[] = [];

    await registerSampleJob(client, {
      execute: async (payload) => {
        executed.push(payload.message);
      },
    });

    await client.sendIdempotent(SAMPLE_JOB_QUEUE, "natural-key-a", { message: "hello" });
    await client.runPendingOnce(SAMPLE_JOB_QUEUE);

    expect(executed).toEqual(["hello"]);
  });

  it("routes the sample job to its dead-letter queue after its executor keeps failing past the retry limit", async () => {
    const client = createInMemoryQueueClient();

    await registerSampleJob(client, {
      execute: async () => {
        throw new Error("simulated executor failure");
      },
    });

    await client.sendIdempotent(SAMPLE_JOB_QUEUE, "natural-key-b", { message: "will fail" });

    // Drive attempts well past the sample job's configured retry limit.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await client.runPendingOnce(SAMPLE_JOB_QUEUE);
    }

    expect(client.peekDeadLetters(SAMPLE_JOB_DEAD_LETTER_QUEUE)).toEqual([
      { message: "will fail" },
    ]);
  });
});
