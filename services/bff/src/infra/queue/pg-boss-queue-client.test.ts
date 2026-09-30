import { describe, expect, it } from "vitest";
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
  });
});
