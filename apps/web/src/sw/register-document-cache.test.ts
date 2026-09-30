import { describe, expect, it, vi } from "vitest";
import { registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";
import { DOCUMENT_CACHE_NAME, registerDocumentCacheRoute } from "./register-document-cache.js";

vi.mock("workbox-routing", () => ({ registerRoute: vi.fn() }));
vi.mock("workbox-strategies", () => ({
  CacheFirst: vi.fn().mockImplementation((options: { cacheName: string }) => ({
    strategyName: "CacheFirst",
    cacheName: options.cacheName,
  })),
}));

describe("registerDocumentCacheRoute", () => {
  it("registers exactly one route using a CacheFirst strategy against th-docs-v1", () => {
    registerDocumentCacheRoute();

    expect(registerRoute).toHaveBeenCalledTimes(1);
    expect(CacheFirst).toHaveBeenCalledWith({ cacheName: DOCUMENT_CACHE_NAME });
    const [, strategy] = vi.mocked(registerRoute).mock.calls[0]!;
    expect(strategy).toEqual({ strategyName: "CacheFirst", cacheName: "th-docs-v1" });
  });

  it("registers a matcher that matches GET /api/documents/:id and rejects other routes", () => {
    registerDocumentCacheRoute();

    const [matchFn] = vi.mocked(registerRoute).mock.calls.at(-1)!;
    expect(matchFn({ url: new URL("https://app.test/api/documents/ticket-1") } as never)).toBe(true);
    expect(matchFn({ url: new URL("https://app.test/api/trip") } as never)).toBe(false);
    expect(matchFn({ url: new URL("https://app.test/api/session") } as never)).toBe(false);
  });
});
