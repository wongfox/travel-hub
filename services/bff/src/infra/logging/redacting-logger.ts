import pino, { type Logger, type LoggerOptions } from "pino";
import type { DestinationStream } from "pino";
import { redactLogPayload } from "./redact.js";

/**
 * Builds a pino logger whose every logged object passes through
 * `redactLogPayload` before serialization, via pino's `formatters.log`
 * hook. This runs on the actual payload structure (not path-based like
 * pino's built-in `redact` option), so it also catches an email-shaped
 * value logged under an unexpected key.
 */
export function createRedactingLogger(
  options: LoggerOptions = {},
  destination?: DestinationStream,
): Logger {
  const mergedOptions: LoggerOptions = {
    ...options,
    formatters: {
      ...options.formatters,
      log(object) {
        return redactLogPayload(object) as Record<string, unknown>;
      },
    },
  };
  return destination ? pino(mergedOptions, destination) : pino(mergedOptions);
}
