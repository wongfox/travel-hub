/**
 * `usage-analytics` client-side consent flag (task 12.1's "consent-gated"
 * requirement; task 12.3's "withdrawing `analytics` consent stops the
 * queue").
 *
 * Honest scope note: unlike `precheckin`'s consent screen, no dedicated web
 * UI exists yet to grant `analytics` consent (the same documented gap as
 * `push`/`pulse` — see `sdd/travel-hub-mvp/apply-progress`'s WU22 entry).
 * This module is the client-side source of truth `trackEvent` checks before
 * enqueueing anything; nothing calls `setAnalyticsConsentGranted(true)` from
 * a UI yet. The server's own `assertConsentGranted` check on `POST
 * /api/events` (task 12.1) remains the authoritative gate regardless — this
 * flag only ever controls whether the CLIENT bothers to queue/send events at
 * all, consistent with "optimistic client, authoritative server" used
 * throughout this codebase (e.g. push opt-in's own client-side gating).
 *
 * `localStorage`, not `sessionStorage` or in-memory state, so the choice
 * persists across tabs/reloads for this device — same storage class as
 * `shared/i18n`'s locale choice.
 */
import { clearQueuedAnalyticsEvents } from "./analytics-queue-store.js";

const ANALYTICS_CONSENT_KEY = "th-analytics-consent-granted";

/**
 * The flag changes synchronously; the returned promise settles once the
 * withdrawal side effect (discarding the IndexedDB queue) has completed, so
 * any caller of `setAnalyticsConsentGranted(false)` gets the full cleanup.
 */
export async function setAnalyticsConsentGranted(granted: boolean): Promise<void> {
  if (granted) {
    localStorage.setItem(ANALYTICS_CONSENT_KEY, "true");
    return;
  }
  // Withdrawal (task 12.3): removing the key, not writing "false", so a
  // stale/corrupted leftover value can never be misread as granted. Events
  // queued while consent was granted are discarded too: they must never be
  // flushed after withdrawal.
  localStorage.removeItem(ANALYTICS_CONSENT_KEY);
  await clearQueuedAnalyticsEvents();
}

export function hasAnalyticsConsentGranted(): boolean {
  return localStorage.getItem(ANALYTICS_CONSENT_KEY) === "true";
}
