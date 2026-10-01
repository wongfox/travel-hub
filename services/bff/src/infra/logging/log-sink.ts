import pino, { type DestinationStream } from "pino";

/**
 * Task 13.3 (observability): "structured JSON logs shipped to a configurable
 * sink". `"stdout"` (the default) relies on structured JSON already being
 * pino's own output format — the actual "shipping" for that sink is the
 * deployment platform's job (e.g. the AWS reference deployment's ECS
 * `awslogs` log driver forwarding container stdout to CloudWatch Logs, see
 * `infra/`; `docker-compose.yml` forwards it to the Docker daemon's own log
 * driver locally). `"file"` is the one sink this module implements directly,
 * for a deployment that wants logs persisted to a mounted path instead of
 * relying on a container runtime's log collection.
 */
export type LogSinkKind = "stdout" | "file";

export interface LogSinkConfig {
  kind: LogSinkKind;
  /** Set only when `kind === "file"`. */
  filePath?: string;
}

export interface LogSinkEnv {
  LOG_SINK?: LogSinkKind | undefined;
  LOG_SINK_FILE_PATH?: string | undefined;
}

/**
 * Resolves the configured log sink from env config (`env.ts`'s `LOG_SINK`/
 * `LOG_SINK_FILE_PATH`). Throws at startup — rather than silently falling
 * back to stdout — when `LOG_SINK=file` is declared without a path, the same
 * fail-fast convention `loadEnv` itself uses for misconfiguration.
 */
export function resolveLogSinkConfig(env: LogSinkEnv): LogSinkConfig {
  const kind = env.LOG_SINK ?? "stdout";
  if (kind === "file") {
    if (!env.LOG_SINK_FILE_PATH) {
      throw new Error('LOG_SINK="file" requires LOG_SINK_FILE_PATH to be set.');
    }
    return { kind, filePath: env.LOG_SINK_FILE_PATH };
  }
  return { kind: "stdout" };
}

/**
 * Builds the `DestinationStream` `createRedactingLogger`'s second argument
 * expects. Returns `undefined` for the `"stdout"` sink so callers fall back
 * to pino's own default destination (`process.stdout`), exactly like every
 * pre-existing `createRedactingLogger()` call site that passes no
 * destination at all. `sync: true` trades a small amount of write
 * performance for logs that are never lost on an unexpected process exit —
 * an acceptable trade for this reference deployment's log volume.
 */
export function createLogDestination(config: LogSinkConfig): DestinationStream | undefined {
  if (config.kind === "file") {
    // `filePath` is guaranteed set for `kind: "file"` by `resolveLogSinkConfig`.
    return pino.destination({ dest: config.filePath as string, sync: true });
  }
  return undefined;
}
