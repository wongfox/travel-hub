import { registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";

/**
 * Design Data Model "Client-side" section: binary third-party ticket files
 * fetched via `GET /api/documents/:id` are cached into this named Cache
 * Storage bucket (task 6.4 issues the route; task 7.1 wires the offline
 * caching). Deliberately NOT one of `denylist.ts`'s sensitive-route
 * families — `travel-documents` is exactly what `offline-trip-data` must
 * keep available without connectivity.
 */
export const DOCUMENT_CACHE_NAME = "th-docs-v1";

const DOCUMENT_ROUTE_PATTERN = /^\/api\/documents\//;

/**
 * Registers the `GET /api/documents/:id` runtime-caching route (task 7.1).
 * `CacheFirst` matches a purchased ticket's effectively-immutable content:
 * once fetched online it is served from `th-docs-v1` on every later request,
 * including fully offline, with the network only consulted on a cache miss.
 */
export function registerDocumentCacheRoute(): void {
  registerRoute(
    ({ url }) => DOCUMENT_ROUTE_PATTERN.test(url.pathname),
    new CacheFirst({ cacheName: DOCUMENT_CACHE_NAME }),
  );
}
