/**
 * Sensitive-route path families that must never be cached anywhere in the
 * system (design Decision 5; spec `offline-trip-data` "Sensitive data
 * excluded from offline cache" and `personal-data-protection` "No offline
 * caching of sensitive data"): pre check-in images, the session cookie
 * exchange/bootstrap, WiFi payment/order state, and push subscriptions.
 *
 * Shared by the web service worker's cache denylist (`apps/web/src/sw`) and
 * the BFF's `Cache-Control: no-store` response header (`services/bff/src/infra/http`)
 * so both enforcement points read the exact same pattern list instead of two
 * independently maintained copies that could silently drift apart.
 */
export const SENSITIVE_ROUTE_PATTERNS: RegExp[] = [
  /^\/api\/precheckin(\/|$)/,
  /^\/api\/session(\/|$)/,
  /^\/api\/wifi(\/|$)/,
  /^\/api\/push(\/|$)/,
];

/** True when `pathname` falls under one of the sensitive-route families above. */
export function isSensitiveRoute(pathname: string): boolean {
  return SENSITIVE_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname));
}
