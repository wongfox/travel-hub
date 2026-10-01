import type { AnalyticsEvent } from "contracts";
import { assertConsentGranted } from "../privacy/consent-guard.js";
import type { ConsentStore } from "../privacy/consent-store.js";
import { computeTripHash } from "./trip-hash.js";
import type { AnalyticsEventStore } from "./ports.js";

export interface RecordAnalyticsEventsInput {
  reservationRef: string;
  events: AnalyticsEvent[];
}

export interface RecordAnalyticsEventsDeps {
  analyticsEventStore: Pick<AnalyticsEventStore, "create">;
  consentStore: Pick<ConsentStore, "findLatest">;
  secret: string;
  /** Injectable clock for deterministic tests; defaults to `Date.now`. */
  now?: () => Date;
}

export interface RecordAnalyticsEventsResult {
  recorded: number;
}

/**
 * `POST /api/events` use case (task 12.1): rejects with
 * `ConsentRequiredError` (reusing task 8.1's shared guard, same convention
 * as `subscribePush`/pre check-in) when no granted `analytics` consent is on
 * file for this reservation — persists NOTHING in that case, not a partial
 * batch. Every persisted event is pseudonymized via `computeTripHash` before
 * it ever reaches `AnalyticsEventStore.create` (task 12.1 acceptance: no
 * `analytics_event` row ever carries a raw `reservation_ref`).
 */
export async function recordAnalyticsEvents(
  input: RecordAnalyticsEventsInput,
  deps: RecordAnalyticsEventsDeps,
): Promise<RecordAnalyticsEventsResult> {
  await assertConsentGranted(deps, input.reservationRef, null, "analytics");

  const tripHash = computeTripHash(input.reservationRef, deps.secret);
  const now = deps.now ? deps.now() : new Date();

  for (const event of input.events) {
    await deps.analyticsEventStore.create({
      name: event.name,
      tripHash,
      occurredAt: event.occurredAt ?? now.toISOString(),
      ...(event.props ? { props: event.props } : {}),
    });
  }

  return { recorded: input.events.length };
}
