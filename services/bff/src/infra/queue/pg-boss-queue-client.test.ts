import { describe, expect, it, vi } from "vitest";
import { createPgBossQueueClient } from "./pg-boss-queue-client.js";

describe("createPgBossQueueClient", () => {
  it("builds a QueueClient without opening a connection (construction is lazy until start())", () => {
    // A syntactically valid but unreachable connection string: proves
    // construction itself never dials out, only .start() would.
    const client = createPgBossQueueClient("postgres://user:pass@127.0.0.1:1/unused");

    expect(typeof client.start).toBe("function");
    expect(typeof client.stop).toBe("function");
    expect(typeof client.createQueue).toBe("function");
    expect(typeof client.sendIdempotent).toBe("function");
    expect(typeof client.work).toBe("function");
    // Task 13.3 (observability): present on the real adapter too, same as
    // every other QueueClient method — real behavior against a live
    // Postgres instance is an environmental gap in this sandbox (no Docker
    // available), same limitation already recorded for this file's other
    // methods (see sdd/travel-hub-mvp/apply-progress).
    expect(typeof client.getQueueDepth).toBe("function");
    expect(typeof client.getDeadLetterCount).toBe("function");
  });
});

const createQueueCalls: Array<{ name: string; options: Record<string, unknown> }> = [];

vi.mock("pg-boss", () => ({
  PgBoss: class {
    async createQueue(name: string, options: Record<string, unknown> = {}) {
      // Real pg-boss rejects a `deadLetter` that names a queue not yet created.
      const dl = options.deadLetter as string | undefined;
      if (dl && !createQueueCalls.some((c) => c.name === dl)) {
        throw new Error(`Queue ${dl} does not exist`);
      }
      createQueueCalls.push({ name, options });
    }
  },
}));

describe("createPgBossQueueClient.createQueue", () => {
  it("creates the dead-letter queue before the queue that references it", async () => {
    createQueueCalls.length = 0;
    const client = createPgBossQueueClient("postgres://user:pass@127.0.0.1:1/unused");

    await client.createQueue("main-q", {
      retryLimit: 5,
      retryBackoffSeconds: 10,
      deadLetterQueue: "main-q-dead-letter",
    });

    expect(createQueueCalls.map((c) => c.name)).toEqual(["main-q-dead-letter", "main-q"]);
    expect(createQueueCalls[1]?.options.deadLetter).toBe("main-q-dead-letter");
  });

  it("creates only the queue itself when no dead-letter queue is declared", async () => {
    createQueueCalls.length = 0;
    const client = createPgBossQueueClient("postgres://user:pass@127.0.0.1:1/unused");

    await client.createQueue("plain-q", { retryLimit: 3, retryBackoffSeconds: 5 });

    expect(createQueueCalls.map((c) => c.name)).toEqual(["plain-q"]);
  });
});
