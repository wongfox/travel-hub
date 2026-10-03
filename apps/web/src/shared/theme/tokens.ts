import type { ServiceTier } from "contracts";

/**
 * Design-token structure for tier-driven theming (design
 * `service-tier-experience`: adapt theme via configuration/design tokens,
 * never tier-specific code branches — see `resolveThemeTokens`).
 */
export interface ThemeTokens {
  colorPrimary: string;
  colorSecondary: string;
  colorAccent: string;
  colorBackground: string;
  colorText: string;
}

/**
 * Applied whenever the resolved tier is `UNKNOWN` or otherwise unresolved
 * (spec `service-tier-experience` "Neutral fallback when tier is unknown").
 */
export const NEUTRAL_THEME_TOKENS: ThemeTokens = {
  colorPrimary: "#1f2933",
  colorSecondary: "#3e4c59",
  colorAccent: "#616e7c",
  colorBackground: "#ffffff",
  colorText: "#102a43",
};

/**
 * Placeholder per-tier palette. The exact palette is a Brand/BR open item
 * (design "Open Questions": tier-specific differences beyond menu/WiFi
 * rule are TBD, pending SIR contract and Brand definition); these values
 * exist so every tier is visually distinct today without blocking on
 * brand assets, and are expected to be replaced wholesale once Brand
 * delivers the real palette — the token *shape* (`ThemeTokens`) is what
 * downstream capabilities (Phase 6+) depend on, not these specific colors.
 */
export const TIER_THEME_TOKENS: Record<ServiceTier, ThemeTokens> = {
  VOYAGER: {
    colorPrimary: "#0b60b0",
    colorSecondary: "#0a4d8c",
    colorAccent: "#3d85c6",
    colorBackground: "#ffffff",
    colorText: "#0b1f33",
  },
  VISTADOME_360: {
    colorPrimary: "#0f9d58",
    colorSecondary: "#0b7a43",
    colorAccent: "#34c98d",
    colorBackground: "#ffffff",
    colorText: "#0b2318",
  },
  PRIME: {
    colorPrimary: "#8e24aa",
    colorSecondary: "#6a1b7a",
    colorAccent: "#b567c9",
    colorBackground: "#ffffff",
    colorText: "#26102b",
  },
  FIRST_CLASS: {
    colorPrimary: "#b8860b",
    colorSecondary: "#8f6a08",
    colorAccent: "#d9a441",
    colorBackground: "#0e0e0e",
    colorText: "#fdf6e3",
  },
  UNKNOWN: NEUTRAL_THEME_TOKENS,
};
