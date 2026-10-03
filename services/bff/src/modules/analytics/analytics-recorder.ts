import type { AnalyticsEventName } from "contracts";
import { computeTripHash } from "./trip-hash.js";
import type { AnalyticsEventStore } from "./ports.js";
import type { ConsentStore } from "../privacy/consent-store.js";

export interface RecordAnalyticsEventInput {
  reservationRef: string;
  name: AnalyticsEventName;
  occurredAt?: string;
  props?: Record<string, unknown>;
}

/** Consent-gated like `recordAnalyticsEvents` below (R1-001): silent no-op when `analytics` consent is missing/withdrawn. */
export interface AnalyticsRecorder {
  record(input: RecordAnalyticsEventInput): Promise<void>;
}

export interface CreateAnalyticsRecorderDeps {
  analyticsEventStore: Pick<AnalyticsEventStore, "create">;
  consentStore: Pick<ConsentStore, "findLatest">;
  secret: string;
  /** Injectable clock for deterministic tests; defaults to `Date.now`. */
  now?: () => Date;
}

/**
 * Awaits `recorder.record(input)` and swallows any failure: analytics
 * instrumentation must never fail (or even delay-fail) the capability action
 * it instruments — the same "never block the passenger flow" principle
 * `submitPulseResponse`/`deliverPulsePrompt` already apply to their own
 * side-channel effects. `recorder` is optional so every task 12.2 call site
 * stays backward compatible with callers that predate this work unit.
 */
export async function recordAnalyticsBestEffort(
  recorder: Pick<AnalyticsRecorder, "record"> | undefined,
  input: RecordAnalyticsEventInput,
): Promise<void> {
  if (!recorder) return;
  try {
    await recorder.record(input);
  } catch {
    // Swallowed intentionally — see doc comment above.
  }
}

export function createAnalyticsRecorder(deps: CreateAnalyticsRecorderDeps): AnalyticsRecorder {
  return {
    async record(input: RecordAnalyticsEventInput): Promise<void> {
      const consent = await deps.consentStore.findLatest(input.reservationRef, null, "analytics");
      if (!consent?.granted) return;

      const tripHash = computeTripHash(input.reservationRef, deps.secret);
      await deps.analyticsEventStore.create({
        name: input.name,
        tripHash,
        occurredAt: input.occurredAt ?? (deps.now ? deps.now() : new Date()).toISOString(),
        ...(input.props ? { props: input.props } : {}),
      });
    },
  };
}
