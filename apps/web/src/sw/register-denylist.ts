import { registerRoute } from "workbox-routing";
import { NetworkOnly } from "workbox-strategies";
import { isDenylistedPath } from "./denylist.js";

/**
 * Registers the sensitive-route denylist as a Workbox `NetworkOnly` route,
 * so the service worker never intercepts or caches these responses even by
 * accident from a future catch-all `/api/*` caching strategy (design
 * Decision 5).
 */
export function registerDenylistRoutes(): void {
  registerRoute(({ url }) => isDenylistedPath(url.pathname), new NetworkOnly());
}
