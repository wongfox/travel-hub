import type { ConsentPurpose } from "contracts";

/**
 * Per-device cache of a GRANTED consent decision (purpose + text version),
 * so a reload does not re-ask. The BFF has no `GET` consent endpoint, so
 * this is a client-side convenience only: the server's own
 * `assertConsentGranted` stays authoritative, and a 403 `consent_required`
 * clears the entry (see `PurposeConsentGate`). Only grants are cached; a
 * changed text version no longer matches and therefore re-asks.
 *
 * Every access is wrapped in try/catch: storage may be blocked or full, and
 * the gate must keep working (by asking again) when it is.
 */
function cacheKey(scope: string, purpose: ConsentPurpose): string {
  return `th-consent:${scope}:${purpose}`;
}

export function hasCachedGrantedConsent(scope: string, purpose: ConsentPurpose, textVersion: string): boolean {
  try {
    return window.localStorage.getItem(cacheKey(scope, purpose)) === textVersion;
  } catch {
    return false;
  }
}

export function cacheGrantedConsent(scope: string, purpose: ConsentPurpose, textVersion: string): void {
  try {
    window.localStorage.setItem(cacheKey(scope, purpose), textVersion);
  } catch {
    // Storage unavailable: the passenger is simply asked again next time.
  }
}

export function clearCachedConsent(scope: string, purpose: ConsentPurpose): void {
  try {
    window.localStorage.removeItem(cacheKey(scope, purpose));
  } catch {
    // Nothing cached that we could clear.
  }
}
