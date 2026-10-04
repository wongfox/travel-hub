import type { ThemeTokens } from "./tokens.js";

const TOKEN_TO_CSS_VARIABLE: Record<keyof ThemeTokens, string> = {
  colorPrimary: "--th-color-primary",
  colorSecondary: "--th-color-secondary",
  colorAccent: "--th-color-accent",
  colorBackground: "--th-color-background",
  colorText: "--th-color-text",
  colorSurface: "--th-color-surface",
  colorTextMuted: "--th-color-text-muted",
  colorBorder: "--th-color-border",
  colorOnPrimary: "--th-color-on-primary",
  colorOnAccent: "--th-color-on-accent",
};

/**
 * Converts `ThemeTokens` into a CSS custom-property record suitable for a
 * React inline `style` prop, e.g. `{ "--th-color-primary": "#0b60b0" }`.
 */
export function themeTokensToCssVariables(tokens: ThemeTokens): Record<string, string> {
  const cssVariables: Record<string, string> = {};
  for (const tokenKey of Object.keys(TOKEN_TO_CSS_VARIABLE) as (keyof ThemeTokens)[]) {
    const cssVariable = TOKEN_TO_CSS_VARIABLE[tokenKey];
    cssVariables[cssVariable] = tokens[tokenKey];
  }
  return cssVariables;
}
