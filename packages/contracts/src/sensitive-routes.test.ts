import { describe, expect, it } from "vitest";
import { isSensitiveRoute } from "./sensitive-routes.js";

describe("isSensitiveRoute", () => {
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
  ])("flags %s as sensitive (design Decision 5 denylist)", (path) => {
    expect(isSensitiveRoute(path)).toBe(true);
  });

  it.each([
    "/api/trip",
    "/api/documents/1",
    "/api/consents",
    "/api/events",
    "/api/links/reissue",
    "/healthz",
    "/api/sessionish",
  ])("does not flag %s (not one of the sensitive route families)", (path) => {
    expect(isSensitiveRoute(path)).toBe(false);
  });
});
