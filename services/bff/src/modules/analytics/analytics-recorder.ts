import type { AnalyticsEventName } from "contracts";
import { computeTripHash } from "./trip-hash.js";
import type { AnalyticsEventStore } from "./ports.js";

export interface RecordAnalyticsEventInput {
  reservationRef: string;
  name: AnalyticsEventName;
  occurredAt?: string;
  props?: Record<string, unknown>;
}

/**
 * The reusable "record one server-side analytics event" seam any task
 * 12.2 call site (WiFi funnel, TFE click-out, push opt-in, pulse
 * response/dispatch) depends on. Deliberately NOT consent-gated — unlike
 * `POST /api/events` (task 12.1's `recordAnalyticsEvents`, below), these are
 * first-party operational funnel events about an action the passenger just
 * took through an already-authorized, already-gated route (e.g. a WiFi
 * order can only be created by an authenticated session; the funnel event
 * records that the order happened, it does not add new tracking the
 * passenger did not already cause). This is a deliberate, documented scope
 * split, not an oversight — see `sdd/travel-hub-mvp/apply-progress`'s WU22
 * entry.
 *
 * `reservationRef` is pseudonymized via `computeTripHash` BEFORE it ever
 * reaches `AnalyticsEventStore.create` (task 12.1 acceptance): this
 * function's own parameter type is the only place in this module set a raw
 * `reservationRef` is accepted for an analytics purpose, and it is never
 * forwarded past the `computeTripHash` call below.
 */
export interface AnalyticsRecorder {
  record(input: RecordAnalyticsEventInput): Promise<void>;
}

export interface CreateAnalyticsRecorderDeps {
  analyticsEventStore: Pick<AnalyticsEventStore, "create">;
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
