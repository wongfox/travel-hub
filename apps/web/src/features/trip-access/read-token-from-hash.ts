/**
 * Reads the access-link token out of a URL fragment (design Decision 4:
 * links look like `https://<app-domain>/t#<token>`). Fragments never reach
 * the server, proxies, CDN logs, or `Referer` — this is a pure function so
 * `LinkLandingPage` can inject `window.location.hash` and stay unit
 * testable without a full browser navigation.
 */
export function readTokenFromHash(hash: string): string | null {
  const trimmed = hash.startsWith("#") ? hash.slice(1) : hash;
  return trimmed.length > 0 ? trimmed : null;
}
