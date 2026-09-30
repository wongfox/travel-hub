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
});
