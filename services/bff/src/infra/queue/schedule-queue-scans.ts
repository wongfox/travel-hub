import type { QueueClient } from "./queue-client.js";

/** Fixed natural key: at most one pending scan per queue, so a slow scan is never stacked by later ticks. */
const SCAN_NATURAL_KEY = "scan";

export interface ScheduleQueueScansOptions {
  intervalMs: number;
  /** Receives send failures; defaults to `console.error`. */
  logger?: (message: string, error: unknown) => void;
}

/**
 * Periodically enqueues one idempotent "scan" job per queue (the scan jobs
 * themselves list their own work, so the payload is empty). A failed send is
 * logged and the next tick retries. Returns a function that stops the scheduler.
 */
export function scheduleQueueScans(
  queueClient: Pick<QueueClient, "sendIdempotent">,
  queueNames: readonly string[],
  options: ScheduleQueueScansOptions,
): () => void {
  if (!Number.isFinite(options.intervalMs) || options.intervalMs <= 0) {
    throw new Error(`scan interval must be a positive number of milliseconds, got ${options.intervalMs}`);
  }
  const logger = options.logger ?? ((message, error) => console.error(message, error));
  const timer = setInterval(() => {
    for (const queue of queueNames) {
      queueClient.sendIdempotent(queue, SCAN_NATURAL_KEY, {}).catch((error: unknown) => {
        logger(`failed to enqueue the ${queue} scan`, error);
      });
    }
  }, options.intervalMs);
  return () => clearInterval(timer);
}
