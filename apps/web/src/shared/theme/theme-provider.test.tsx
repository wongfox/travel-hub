import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "./theme-provider.js";
import { NEUTRAL_THEME_TOKENS, TIER_THEME_TOKENS } from "./tokens.js";

describe("ThemeProvider", () => {
  it("renders the neutral default theme as CSS custom properties with no missing token when the tier is unresolved", () => {
    render(
      <ThemeProvider tier={null}>
        <span>content</span>
      </ThemeProvider>,
    );

    const container = screen.getByTestId("theme-provider");
    expect(container.style.getPropertyValue("--th-color-primary")).toBe(NEUTRAL_THEME_TOKENS.colorPrimary);
    expect(container.style.getPropertyValue("--th-color-secondary")).toBe(NEUTRAL_THEME_TOKENS.colorSecondary);
    expect(container.style.getPropertyValue("--th-color-accent")).toBe(NEUTRAL_THEME_TOKENS.colorAccent);
    expect(container.style.getPropertyValue("--th-color-background")).toBe(NEUTRAL_THEME_TOKENS.colorBackground);
    expect(container.style.getPropertyValue("--th-color-text")).toBe(NEUTRAL_THEME_TOKENS.colorText);
    expect(container.style.getPropertyValue("--th-color-surface")).toBe(NEUTRAL_THEME_TOKENS.colorSurface);
    expect(container.style.getPropertyValue("--th-color-text-muted")).toBe(NEUTRAL_THEME_TOKENS.colorTextMuted);
    expect(container.style.getPropertyValue("--th-color-border")).toBe(NEUTRAL_THEME_TOKENS.colorBorder);
    expect(container.style.getPropertyValue("--th-color-on-primary")).toBe(NEUTRAL_THEME_TOKENS.colorOnPrimary);
    expect(container.style.getPropertyValue("--th-color-on-accent")).toBe(NEUTRAL_THEME_TOKENS.colorOnAccent);
  });

  it("applies the resolved tier's tokens when a tier is known", () => {
    render(
      <ThemeProvider tier="FIRST_CLASS">
        <span>content</span>
      </ThemeProvider>,
    );

    const container = screen.getByTestId("theme-provider");
    expect(container.style.getPropertyValue("--th-color-primary")).toBe(TIER_THEME_TOKENS.FIRST_CLASS.colorPrimary);
  });

  it("tags the provider element with the theme-root class so global styles can paint the themed surface", () => {
    render(
      <ThemeProvider tier="PRIME">
        <span>content</span>
      </ThemeProvider>,
    );

    expect(screen.getByTestId("theme-provider")).toHaveClass("theme-root");
  });

  it("renders its children", () => {
    render(
      <ThemeProvider tier="FIRST_CLASS">
        <span>content</span>
      </ThemeProvider>,
    );

    expect(screen.getByText("content")).toBeInTheDocument();
  });
});
