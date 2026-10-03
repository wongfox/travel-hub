import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRedactingLogger } from "./redacting-logger.js";
import { createLogDestination, resolveLogSinkConfig } from "./log-sink.js";

describe("resolveLogSinkConfig", () => {
  it("defaults to stdout when LOG_SINK is unset", () => {
    expect(resolveLogSinkConfig({})).toEqual({ kind: "stdout" });
  });

  it("resolves a file sink with its configured path", () => {
    expect(resolveLogSinkConfig({ LOG_SINK: "file", LOG_SINK_FILE_PATH: "/var/log/bff.log" })).toEqual({
      kind: "file",
      filePath: "/var/log/bff.log",
    });
  });

  it("throws a descriptive error when LOG_SINK is file but LOG_SINK_FILE_PATH is missing", () => {
    expect(() => resolveLogSinkConfig({ LOG_SINK: "file" })).toThrow(/LOG_SINK_FILE_PATH/);
  });
});

describe("createLogDestination", () => {
  it("returns undefined for the stdout sink, so callers fall back to pino's own default destination", () => {
    expect(createLogDestination({ kind: "stdout" })).toBeUndefined();
  });

  it("writes structured JSON log lines to the configured file path", () => {
    const dir = mkdtempSync(join(tmpdir(), "bff-log-sink-test-"));
    const filePath = join(dir, "bff.log");
    try {
      const destination = createLogDestination({ kind: "file", filePath });
      const logger = createRedactingLogger({}, destination);

      logger.info({ requestId: "req-1" }, "boot complete");

      const lines = readFileSync(filePath, "utf-8").trim().split("\n");
      const entry = JSON.parse(lines[lines.length - 1]!) as Record<string, unknown>;
      expect(entry.requestId).toBe("req-1");
      expect(entry.msg).toBe("boot complete");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
