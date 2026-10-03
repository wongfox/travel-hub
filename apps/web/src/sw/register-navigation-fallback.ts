import { createHandlerBoundToURL } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

/** The precached app shell every client-side route is served from. */
export const NAVIGATION_FALLBACK_URL = "/index.html";

/** BFF routes must reach the network (or fail), never be answered with the HTML shell. */
const NAVIGATION_DENYLIST = [/^\/api\//, /^\/webhooks\//, /^\/healthz$/];

/**
 * Registers the SPA navigation fallback: a navigation to any client-side
 * route (e.g. a reload of `/trip/documents`) is answered with the precached
 * app shell, so the router can render from the offline store while offline.
 * Without it only `/index.html` itself is served from the precache, and a
 * deep-link reload fails with a browser network error.
 */
export function registerNavigationFallback(): void {
  registerRoute(
    new NavigationRoute(createHandlerBoundToURL(NAVIGATION_FALLBACK_URL), { denylist: NAVIGATION_DENYLIST }),
  );
}
