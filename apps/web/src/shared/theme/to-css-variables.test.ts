import { describe, expect, it } from "vitest";
import { NEUTRAL_THEME_TOKENS } from "./tokens.js";
import { themeTokensToCssVariables } from "./to-css-variables.js";

describe("themeTokensToCssVariables", () => {
  it("produces a CSS custom property for every theme token, with no missing token", () => {
    const cssVariables = themeTokensToCssVariables(NEUTRAL_THEME_TOKENS);

    expect(cssVariables).toEqual({
      "--th-color-primary": NEUTRAL_THEME_TOKENS.colorPrimary,
      "--th-color-secondary": NEUTRAL_THEME_TOKENS.colorSecondary,
      "--th-color-accent": NEUTRAL_THEME_TOKENS.colorAccent,
      "--th-color-background": NEUTRAL_THEME_TOKENS.colorBackground,
      "--th-color-text": NEUTRAL_THEME_TOKENS.colorText,
    });
  });

  it("produces only valid, non-empty hex color values", () => {
    const cssVariables = themeTokensToCssVariables(NEUTRAL_THEME_TOKENS);

    for (const value of Object.values(cssVariables)) {
      expect(value).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
