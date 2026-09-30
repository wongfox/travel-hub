import type { ServiceTier } from "contracts";
import { NEUTRAL_THEME_TOKENS, TIER_THEME_TOKENS, type ThemeTokens } from "./tokens.js";

/**
 * Resolves the theme tokens for a passenger's service tier. `null`/`undefined`
 * (tier not yet resolved) and the `UNKNOWN` tier both fall back to the
 * neutral default theme (spec `service-tier-experience` "Neutral fallback
 * when tier is unknown").
 */
export function resolveThemeTokens(tier: ServiceTier | null | undefined): ThemeTokens {
  if (tier === null || tier === undefined) {
    return NEUTRAL_THEME_TOKENS;
  }
  return TIER_THEME_TOKENS[tier];
}
