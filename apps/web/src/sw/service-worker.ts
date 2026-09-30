import { precacheAndRoute } from "workbox-precaching";

/**
 * Minimal `injectManifest` service worker satisfying task 4.1's PWA build
 * acceptance criterion (a precached app-shell manifest). The full precache
 * list, the sensitive-route denylist (`/api/precheckin/**`, `/api/session`,
 * `/api/wifi/**`, `/api/push/**`), versioned precache, and the remote-kill
 * check (`/sw-kill.json`) are task 4.6's scope (design Decision 5) — see
 * `sdd/travel-hub-mvp/apply-progress` for this work unit's boundary.
 *
 * `self` is typed locally rather than via the `webworker` lib (which would
 * conflict with the app's `dom` lib) — a standard pattern for `injectManifest`
 * service worker sources.
 */
declare const self: {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

precacheAndRoute(self.__WB_MANIFEST);
