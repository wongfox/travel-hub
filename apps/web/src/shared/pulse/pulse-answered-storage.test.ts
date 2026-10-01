import { beforeEach, describe, expect, it } from "vitest";
import { hasAnsweredPulseLocally, markPulseAnsweredLocally } from "./pulse-answered-storage.js";

describe("pulse-answered-storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("reports not-answered for a leg with no recorded local answer", () => {
    expect(hasAnsweredPulseLocally("link-1", "L1")).toBe(false);
  });

  it("reports answered after marking a leg answered", () => {
    markPulseAnsweredLocally("link-1", "L1");

    expect(hasAnsweredPulseLocally("link-1", "L1")).toBe(true);
  });

  it("scopes the answered flag per (linkId, legId) — a different leg or link is unaffected", () => {
    markPulseAnsweredLocally("link-1", "L1");

    expect(hasAnsweredPulseLocally("link-1", "L2")).toBe(false);
    expect(hasAnsweredPulseLocally("link-2", "L1")).toBe(false);
  });
});
