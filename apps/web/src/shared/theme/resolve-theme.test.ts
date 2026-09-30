import { describe, expect, it } from "vitest";
import { resolveThemeTokens } from "./resolve-theme.js";
import { NEUTRAL_THEME_TOKENS, TIER_THEME_TOKENS } from "./tokens.js";

describe("resolveThemeTokens", () => {
  it("resolves tier-specific tokens for a known tier", () => {
    expect(resolveThemeTokens("PRIME")).toEqual(TIER_THEME_TOKENS.PRIME);
  });

  it("falls back to the neutral theme for the UNKNOWN tier", () => {
    expect(resolveThemeTokens("UNKNOWN")).toEqual(NEUTRAL_THEME_TOKENS);
  });

  it("falls back to the neutral theme when the tier is null (unresolved)", () => {
    expect(resolveThemeTokens(null)).toEqual(NEUTRAL_THEME_TOKENS);
  });

  it("falls back to the neutral theme when the tier is undefined (unresolved)", () => {
    expect(resolveThemeTokens(undefined)).toEqual(NEUTRAL_THEME_TOKENS);
  });

  it("resolves distinct tokens for two different known tiers", () => {
    expect(resolveThemeTokens("VOYAGER")).not.toEqual(resolveThemeTokens("FIRST_CLASS"));
  });
});
