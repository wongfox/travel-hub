/**
 * Sensitive-route cache denylist (design Decision 5; spec
 * `offline-trip-data` "Sensitive data excluded from offline cache" and
 * `personal-data-protection` "No offline caching of sensitive data"). These
 * four route families MUST NEVER be cached by the service worker — pre
 * check-in images, the session cookie exchange, WiFi payment/order state,
 * and push subscriptions — regardless of any future caching strategy added
 * for other `/api/*` routes.
 */
const DENYLIST_PATTERNS: RegExp[] = [
  /^\/api\/precheckin(\/|$)/,
  /^\/api\/session(\/|$)/,
  /^\/api\/wifi(\/|$)/,
  /^\/api\/push(\/|$)/,
];

/** True when `pathname` falls under one of the four sensitive-route families above. */
export function isDenylistedPath(pathname: string): boolean {
  return DENYLIST_PATTERNS.some((pattern) => pattern.test(pathname));
}
