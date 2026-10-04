import { describe, expect, it } from "vitest";
import { NEUTRAL_THEME_TOKENS, TIER_THEME_TOKENS, type ThemeTokens } from "./tokens.js";

function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((index) => {
    const channel = parseInt(hex.slice(index, index + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground: string, background: string): number {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a) as [
    number,
    number,
  ];
  return (lighter + 0.05) / (darker + 0.05);
}

const ALL_THEMES = Object.entries({ NEUTRAL: NEUTRAL_THEME_TOKENS, ...TIER_THEME_TOKENS });

describe("theme tokens", () => {
  it.each(ALL_THEMES)("%s defines every token as a 6-digit hex color", (_name, tokens) => {
    const keys: (keyof ThemeTokens)[] = [
      "colorPrimary",
      "colorSecondary",
      "colorAccent",
      "colorBackground",
      "colorText",
      "colorSurface",
      "colorTextMuted",
      "colorBorder",
      "colorOnPrimary",
      "colorOnAccent",
    ];
    for (const key of keys) {
      expect(tokens[key], key).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  // WCAG 2.x AA for normal text is 4.5:1 for every text/background pairing the
  // design system defines, in every theme (the contrast table in the ODD doc
  // is generated from the same pairs).
  it.each(ALL_THEMES)("%s keeps every text pairing at or above WCAG AA (4.5:1)", (_name, t) => {
    const pairs: [string, string, string][] = [
      ["text/background", t.colorText, t.colorBackground],
      ["text/surface", t.colorText, t.colorSurface],
      ["muted/background", t.colorTextMuted, t.colorBackground],
      ["muted/surface", t.colorTextMuted, t.colorSurface],
      ["primary/background", t.colorPrimary, t.colorBackground],
      ["primary/surface", t.colorPrimary, t.colorSurface],
      ["onPrimary/primary", t.colorOnPrimary, t.colorPrimary],
      ["onPrimary/secondary", t.colorOnPrimary, t.colorSecondary],
      ["onAccent/accent", t.colorOnAccent, t.colorAccent],
    ];
    for (const [label, foreground, background] of pairs) {
      expect(contrastRatio(foreground, background), label).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps a dark surface for FIRST_CLASS and a light one for every other theme", () => {
    expect(relativeLuminance(TIER_THEME_TOKENS.FIRST_CLASS.colorBackground)).toBeLessThan(0.05);
    for (const tier of ["VOYAGER", "VISTADOME_360", "PRIME", "UNKNOWN"] as const) {
      expect(relativeLuminance(TIER_THEME_TOKENS[tier].colorBackground)).toBeGreaterThan(0.8);
    }
  });

  it("uses the brand cream page background and brand green primary as the neutral base", () => {
    expect(NEUTRAL_THEME_TOKENS.colorBackground).toBe("#f9f7f0");
    expect(NEUTRAL_THEME_TOKENS.colorPrimary).toBe("#053220");
  });
});
