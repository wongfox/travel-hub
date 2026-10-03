import { describe, expect, it } from "vitest";
import { MissingDefaultTierContentError, resolveTieredContent } from "./resolve-content-tier.js";

describe("resolveTieredContent", () => {
  it("returns the requested tier's content with no fallback flag when present", () => {
    const result = resolveTieredContent({
      byTier: { VOYAGER: "basic menu", PRIME: "prime menu" },
      requestedTier: "PRIME",
      defaultTier: "VOYAGER",
    });

    expect(result).toEqual({ data: "prime menu", tier: "PRIME", fallbackTier: false });
  });

  it("falls back to the default tier's content when the requested tier is missing", () => {
    const result = resolveTieredContent({
      byTier: { VOYAGER: "basic menu" },
      requestedTier: "FIRST_CLASS",
      defaultTier: "VOYAGER",
    });

    expect(result).toEqual({ data: "basic menu", tier: "VOYAGER", fallbackTier: true });
  });

  it("does not flag a fallback when the requested tier IS the default tier", () => {
    const result = resolveTieredContent({
      byTier: { VOYAGER: "basic menu" },
      requestedTier: "VOYAGER",
      defaultTier: "VOYAGER",
    });

    expect(result).toEqual({ data: "basic menu", tier: "VOYAGER", fallbackTier: false });
  });

  it("throws MissingDefaultTierContentError when neither the requested nor the default tier has content", () => {
    expect(() =>
      resolveTieredContent({
        byTier: { PRIME: "prime menu" },
        requestedTier: "FIRST_CLASS",
        defaultTier: "VOYAGER",
      }),
    ).toThrow(MissingDefaultTierContentError);
  });

  it("names the missing default tier in the thrown error's message", () => {
    expect.assertions(1);
    try {
      resolveTieredContent({ byTier: {}, requestedTier: "FIRST_CLASS", defaultTier: "VOYAGER" });
    } catch (error) {
      expect((error as Error).message).toContain("VOYAGER");
    }
  });

  it("resolves UNKNOWN tier (neutral fallback from resolveServiceTier) to the default tier's content", () => {
    const result = resolveTieredContent({
      byTier: { VOYAGER: "basic menu" },
      requestedTier: "UNKNOWN",
      defaultTier: "VOYAGER",
    });

    expect(result).toEqual({ data: "basic menu", tier: "VOYAGER", fallbackTier: true });
  });
});
