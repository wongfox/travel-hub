import { precacheAndRoute } from "workbox-precaching";
import { registerDenylistRoutes } from "./register-denylist.js";
import { registerDocumentCacheRoute } from "./register-document-cache.js";
import { checkRemoteKill } from "./kill-switch.js";

/**
 * `injectManifest` service worker (design Decision 5). Precaches the app
 * shell (locale bundles are statically imported into the JS chunks — see
 * `i18n/index.ts` — so they precache automatically with no separate
 * network route to list). `registerDenylistRoutes` (task 4.6) ensures
 * `/api/precheckin/**`, `/api/session`, `/api/wifi/**`, and `/api/push/**`
 * are NEVER cached, matching (and defending in depth alongside) the BFF's
 * own `Cache-Control: no-store` on those routes (spec `offline-trip-data`
 * "Sensitive data excluded from offline cache", task 7.2). Precache
 * versioning comes from Workbox's content-hashed manifest (`__WB_MANIFEST`)
 * — every deploy gets a new revision automatically, so no separate cache
 * name bump is needed here. `checkRemoteKill` runs on activation and
 * unregisters + clears every cache when `/sw-kill.json` reports the app
 * should be killed (design Migration/Rollout item 5).
 * `registerDocumentCacheRoute` (task 7.1) caches purchased tickets into
 * `th-docs-v1` so `travel-documents` stays viewable offline after one
 * online load, ordered after the denylist so a future overlapping pattern
 * still resolves to whichever route Workbox matches first without either
 * route depending on the other's registration order today.
 *
 * `self` is typed locally rather than via the `webworker` lib (which would
 * conflict with the app's `dom` lib) — a standard pattern for `injectManifest`
 * service worker sources.
 */
declare const self: {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
  fetch: typeof fetch;
  caches: CacheStorage;
  registration: { unregister: () => Promise<boolean> };
  addEventListener: (
    type: "activate",
    listener: (event: { waitUntil: (promise: Promise<unknown>) => void }) => void,
  ) => void;
};

precacheAndRoute(self.__WB_MANIFEST);

registerDenylistRoutes();
registerDocumentCacheRoute();

self.addEventListener("activate", (event) => {
  event.waitUntil(
    checkRemoteKill({
      fetchImpl: self.fetch,
      cachesImpl: self.caches,
      unregister: () => self.registration.unregister(),
    }),
  );
});
