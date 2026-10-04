import type { ServiceTier } from "contracts";

/**
 * Design-token structure for tier-driven theming (design
 * `service-tier-experience`: adapt theme via configuration/design tokens,
 * never tier-specific code branches — see `resolveThemeTokens`).
 *
 * Roles (every pairing below is contrast-checked in `tokens.test.ts`):
 * - `colorBackground` / `colorText` / `colorTextMuted`: page surface and its text.
 * - `colorSurface` / `colorBorder`: elevated cards and their hairlines.
 * - `colorPrimary` (+ `colorSecondary`, its darker variant): the tier's ink color,
 *   used as text/icon color on `colorBackground`/`colorSurface` and as the fill
 *   behind `colorOnPrimary` (boarding-pass hero, active states).
 * - `colorAccent`: the tier's soft tint, a fill behind `colorOnAccent` (badges, chips).
 */
export interface ThemeTokens {
  colorPrimary: string;
  colorSecondary: string;
  colorAccent: string;
  colorBackground: string;
  colorText: string;
  colorSurface: string;
  colorTextMuted: string;
  colorBorder: string;
  colorOnPrimary: string;
  colorOnAccent: string;
}

/** Light surface shared by every non-dark theme: the brand cream page with white cards. */
const LIGHT_BASE = {
  colorBackground: "#f9f7f0",
  colorText: "#14231b",
  colorSurface: "#ffffff",
  colorTextMuted: "#55635a",
  colorBorder: "#e4dfcf",
} as const;

/**
 * Applied whenever the resolved tier is `UNKNOWN` or otherwise unresolved
 * (spec `service-tier-experience` "Neutral fallback when tier is unknown"):
 * the brand identity itself (Inca Rail green on cream), no tier color.
 */
export const NEUTRAL_THEME_TOKENS: ThemeTokens = {
  ...LIGHT_BASE,
  colorPrimary: "#053220",
  colorSecondary: "#0b4a33",
  colorAccent: "#d9ccaa",
  colorOnPrimary: "#f9f7f0",
  colorOnAccent: "#053220",
};

/**
 * Provisional per-tier palette on top of the shared brand base (the exact
 * tier palette is still a Brand open item, design "Open Questions"): each tier
 * only supplies its own ink/tint pair; the light surface, text and borders
 * are the brand's, and `FIRST_CLASS` keeps a dark surface. Components never
 * branch on the tier — they read these values as `--th-color-*` variables.
 */
export const TIER_THEME_TOKENS: Record<ServiceTier, ThemeTokens> = {
  VOYAGER: {
    ...LIGHT_BASE,
    colorPrimary: "#1d5f8f",
    colorSecondary: "#14476c",
    colorAccent: "#bcd9ee",
    colorOnPrimary: "#ffffff",
    colorOnAccent: "#0f2f47",
  },
  VISTADOME_360: {
    ...LIGHT_BASE,
    colorPrimary: "#0c6b6f",
    colorSecondary: "#08504f",
    colorAccent: "#bfe3df",
    colorOnPrimary: "#ffffff",
    colorOnAccent: "#08373a",
  },
  PRIME: {
    ...LIGHT_BASE,
    colorPrimary: "#7b2f55",
    colorSecondary: "#5e2240",
    colorAccent: "#efcddd",
    colorOnPrimary: "#ffffff",
    colorOnAccent: "#4a1832",
  },
  FIRST_CLASS: {
    colorBackground: "#0b1410",
    colorText: "#f3efe3",
    colorSurface: "#15231c",
    colorTextMuted: "#b4bdb4",
    colorBorder: "#2b3d33",
    colorPrimary: "#d8b25a",
    colorSecondary: "#b8963f",
    colorAccent: "#d8b25a",
    colorOnPrimary: "#1a1405",
    colorOnAccent: "#1a1405",
  },
  UNKNOWN: NEUTRAL_THEME_TOKENS,
};
