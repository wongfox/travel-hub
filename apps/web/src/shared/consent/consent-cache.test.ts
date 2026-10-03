import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cacheGrantedConsent, clearCachedConsent, hasCachedGrantedConsent } from "./consent-cache.js";

describe("consent-cache", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("reports nothing cached before any grant", () => {
    expect(hasCachedGrantedConsent("link-1", "push", "v1")).toBe(false);
  });

  it("reports a grant for the same scope, purpose and text version", () => {
    cacheGrantedConsent("link-1", "push", "v1");

    expect(hasCachedGrantedConsent("link-1", "push", "v1")).toBe(true);
  });

  it("does not match a different text version, purpose or scope", () => {
    cacheGrantedConsent("link-1", "push", "v1");

    expect(hasCachedGrantedConsent("link-1", "push", "v2")).toBe(false);
    expect(hasCachedGrantedConsent("link-1", "pulse", "v1")).toBe(false);
    expect(hasCachedGrantedConsent("link-2", "push", "v1")).toBe(false);
  });

  it("forgets a cached grant when cleared", () => {
    cacheGrantedConsent("link-1", "push", "v1");
    clearCachedConsent("link-1", "push");

    expect(hasCachedGrantedConsent("link-1", "push", "v1")).toBe(false);
  });

  it("never throws when localStorage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(() => cacheGrantedConsent("link-1", "push", "v1")).not.toThrow();
    expect(() => clearCachedConsent("link-1", "push")).not.toThrow();
    expect(hasCachedGrantedConsent("link-1", "push", "v1")).toBe(false);
  });
});
