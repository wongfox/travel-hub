import { describe, expect, it } from "vitest";
import { isDenylistedPath } from "./denylist.js";

describe("isDenylistedPath", () => {
  it.each([
    "/api/precheckin",
    "/api/precheckin/1",
    "/api/session",
    "/api/session/",
    "/api/wifi",
    "/api/wifi/packages",
    "/api/wifi/orders/123",
    "/api/push",
    "/api/push/subscriptions",
  ])("denies %s (design Decision 5 sensitive-route denylist)", (path) => {
    expect(isDenylistedPath(path)).toBe(true);
  });

  it.each(["/api/trip", "/api/documents/1", "/api/consents", "/api/events", "/healthz", "/api/sessionish"])(
    "allows %s (not one of the four denylisted route families)",
    (path) => {
      expect(isDenylistedPath(path)).toBe(false);
    },
  );

  // Task 7.2: re-verify the denylist against the real routes that exist as
  // of Phase 7 (`GET /api/trip`, `GET /api/documents/:id`, `POST/GET/DELETE
  // /api/session`, `POST /api/links/reissue`), not just the design's
  // hypothetical route families from task 4.6.
  it("denies the real GET /api/session bootstrap route (task 5.3)", () => {
    expect(isDenylistedPath("/api/session")).toBe(true);
  });

  it("allows the real GET /api/trip overview route (task 6.2) so it stays cacheable by the app layer", () => {
    expect(isDenylistedPath("/api/trip")).toBe(false);
  });

  it("allows the real GET /api/documents/:id ticket route (task 6.4) — task 7.1 caches it into th-docs-v1", () => {
    expect(isDenylistedPath("/api/documents/ticket-123")).toBe(false);
  });

  it("does not match the real POST /api/links/reissue route (task 5.4) — not one of the four sensitive families", () => {
    // Safe regardless: `registerDenylistRoutes` only registers a GET route
    // (Workbox's `registerRoute` default method), and reissue is POST-only,
    // so it is never intercepted or cached by the service worker either way.
    expect(isDenylistedPath("/api/links/reissue")).toBe(false);
  });
});
