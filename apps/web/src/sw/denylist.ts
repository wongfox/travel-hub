import { isSensitiveRoute } from "contracts";

/**
 * Sensitive-route cache denylist (design Decision 5; spec
 * `offline-trip-data` "Sensitive data excluded from offline cache" and
 * `personal-data-protection` "No offline caching of sensitive data"). These
 * route families MUST NEVER be cached by the service worker — pre check-in
 * images, the session cookie exchange, WiFi payment/order state, and push
 * subscriptions — regardless of any future caching strategy added for other
 * `/api/*` routes (e.g. `GET /api/documents/:id`, task 7.1's `th-docs-v1`
 * ticket cache, which is deliberately NOT in this list).
 *
 * task 7.2 (`offline-trip-data` "Sensitive data excluded", re-verified
 * against the real routes that exist as of Phase 7): the pattern list itself
 * now lives in `contracts` (`isSensitiveRoute`) so the service worker and
 * the BFF's `Cache-Control: no-store` header (`services/bff/src/infra/http/security-plugins.ts`)
 * enforce the exact same denylist instead of two copies that could drift.
 * `POST /api/links/reissue` is deliberately NOT in this list: it is not one
 * of the four sensitive-data route families, and Workbox's `registerRoute`
 * only intercepts `GET` requests by default (`register-denylist.ts`), so a
 * `POST`-only route like reissue is never cacheable by the service worker
 * regardless of this list's contents.
 */
export function isDenylistedPath(pathname: string): boolean {
  return isSensitiveRoute(pathname);
}
