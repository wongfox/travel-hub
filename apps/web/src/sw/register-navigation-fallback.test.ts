import { describe, expect, it, vi } from "vitest";
import { createHandlerBoundToURL } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { NAVIGATION_FALLBACK_URL, registerNavigationFallback } from "./register-navigation-fallback.js";

vi.mock("workbox-precaching", () => ({ createHandlerBoundToURL: vi.fn().mockReturnValue("shell-handler") }));
vi.mock("workbox-routing", () => ({
  registerRoute: vi.fn(),
  NavigationRoute: vi.fn().mockImplementation((handler: unknown, options: unknown) => ({ handler, options })),
}));

describe("registerNavigationFallback", () => {
  it("serves the precached app shell for client-side routes, so a deep link loads offline", () => {
    registerNavigationFallback();

    expect(createHandlerBoundToURL).toHaveBeenCalledWith(NAVIGATION_FALLBACK_URL);
    expect(NavigationRoute).toHaveBeenCalledTimes(1);
    expect(registerRoute).toHaveBeenCalledTimes(1);
    const [handler] = vi.mocked(NavigationRoute).mock.calls[0]!;
    expect(handler).toBe("shell-handler");
  });

  it("never falls back to the shell for BFF routes", () => {
    registerNavigationFallback();

    const [, options] = vi.mocked(NavigationRoute).mock.calls.at(-1)!;
    const denylist = options!.denylist!;
    const denied = (path: string) => denylist.some((pattern) => pattern.test(path));
    expect(denied("/api/trip")).toBe(true);
    expect(denied("/webhooks/payments/stub")).toBe(true);
    expect(denied("/healthz")).toBe(true);
    expect(denied("/trip/documents")).toBe(false);
  });
});
