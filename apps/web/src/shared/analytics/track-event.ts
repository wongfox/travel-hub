import type { ClientAnalyticsEventName } from "contracts";
import { hasAnalyticsConsentGranted } from "./analytics-consent.js";
import { enqueueAnalyticsEvent } from "./analytics-queue-store.js";

export interface TrackEventInput {
  name: ClientAnalyticsEventName;
  props?: Record<string, unknown>;
}

/**
 * The consent-gated entry point every web call site should use (task 12.1).
 * A no-op when `analytics` consent is not currently granted — including
 * right after withdrawal (task 12.3: "withdrawing `analytics` consent stops
 * the web queue"). Honest limitation: a request already in
 * flight to the server when consent is withdrawn cannot be recalled (the
 * server-side withdrawal cascade deletes anything it stored but has not yet
 * forwarded). `setAnalyticsConsentGranted(false)` also discards events that
 * are already queued.
 */
export async function trackEvent(input: TrackEventInput): Promise<void> {
  if (!hasAnalyticsConsentGranted()) {
    return;
  }
  await enqueueAnalyticsEvent(input);
}
