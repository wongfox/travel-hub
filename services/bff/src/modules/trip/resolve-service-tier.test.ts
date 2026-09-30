import { describe, expect, it } from "vitest";
import { resolveServiceTier } from "./resolve-service-tier.js";

describe("resolveServiceTier", () => {
  it.each([["VOYAGER"], ["VISTADOME_360"], ["PRIME"], ["FIRST_CLASS"], ["UNKNOWN"]])(
    "resolves the known raw tier %s unchanged",
    (raw) => {
      expect(resolveServiceTier(raw)).toBe(raw);
    },
  );

  it("resolves two different valid tiers to two different values", () => {
    expect(resolveServiceTier("PRIME")).not.toBe(resolveServiceTier("VOYAGER"));
  });

  it.each([
    ["an unrecognized raw string", "GROUP"],
    ["null", null],
    ["undefined", undefined],
    ["a number", 42],
    ["an empty string", ""],
  ])("falls back to UNKNOWN for %s, without throwing", (_label, raw) => {
    expect(() => resolveServiceTier(raw)).not.toThrow();
    expect(resolveServiceTier(raw)).toBe("UNKNOWN");
  });
});
