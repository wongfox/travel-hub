import type { AnalyticsEventName } from "contracts";
import { hasAnalyticsConsentGranted } from "./analytics-consent.js";
import { enqueueAnalyticsEvent } from "./analytics-queue-store.js";

export interface TrackEventInput {
  name: AnalyticsEventName;
  props?: Record<string, unknown>;
}

/**
 * The consent-gated entry point every web call site should use (task 12.1).
 * A no-op when `analytics` consent is not currently granted — including
 * right after withdrawal (task 12.3: "withdrawing `analytics` consent stops
 * the web queue"). Honest limitation, stated explicitly per the task: this
 * can only stop FUTURE events from being queued; it cannot un-send a beacon
 * that `flushAnalyticsQueue` already handed to `navigator.sendBeacon` before
 * withdrawal, since that hand-off is irreversible once made.
 */
export async function trackEvent(input: TrackEventInput): Promise<void> {
  if (!hasAnalyticsConsentGranted()) {
    return;
  }
  await enqueueAnalyticsEvent(input);
}
