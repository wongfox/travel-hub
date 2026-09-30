import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createRedactingLogger } from "./redacting-logger.js";

function createCapturingStream(): { stream: Writable; lines: () => Record<string, unknown>[] } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  return {
    stream,
    lines: () =>
      chunks
        .join("")
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

describe("createRedactingLogger", () => {
  it("applies the denylist redaction to every logged payload before it is written", () => {
    const { stream, lines } = createCapturingStream();
    const logger = createRedactingLogger({}, stream);

    logger.info({ linkToken: "should-not-leak", requestId: "req-1" }, "session exchanged");

    const [entry] = lines();
    expect(entry?.linkToken).toBe("[REDACTED]");
    expect(entry?.requestId).toBe("req-1");
    expect(entry?.msg).toBe("session exchanged");
  });

  it("redacts a different payload shape at error level, proving redaction is not tied to one log call site", () => {
    const { stream, lines } = createCapturingStream();
    const logger = createRedactingLogger({}, stream);

    logger.error(
      { cookie: "__Host-th_sess=secret", tripHash: "abc123" },
      "webhook signature rejected",
    );

    const [entry] = lines();
    expect(entry?.cookie).toBe("[REDACTED]");
    expect(entry?.tripHash).toBe("abc123");
  });
});
