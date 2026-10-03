import { describe, expect, it, vi } from "vitest";
import { registerRoute } from "workbox-routing";
import { registerDenylistRoutes } from "./register-denylist.js";

vi.mock("workbox-routing", () => ({ registerRoute: vi.fn() }));
vi.mock("workbox-strategies", () => ({
  NetworkOnly: vi.fn().mockImplementation(() => ({ strategyName: "NetworkOnly" })),
}));

describe("registerDenylistRoutes", () => {
  it("registers exactly one route using a NetworkOnly strategy", () => {
    registerDenylistRoutes();

    expect(registerRoute).toHaveBeenCalledTimes(1);
    const [, strategy] = vi.mocked(registerRoute).mock.calls[0]!;
    expect(strategy).toEqual({ strategyName: "NetworkOnly" });
  });

  it("registers a matcher that matches denylisted paths and rejects others", () => {
    registerDenylistRoutes();

    const [matchFn] = vi.mocked(registerRoute).mock.calls.at(-1)!;
    expect(matchFn({ url: new URL("https://app.test/api/precheckin/1") } as never)).toBe(true);
    expect(matchFn({ url: new URL("https://app.test/api/trip") } as never)).toBe(false);
  });
});
