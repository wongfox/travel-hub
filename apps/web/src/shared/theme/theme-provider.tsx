import type { CSSProperties, ReactNode } from "react";
import type { ServiceTier } from "contracts";
import { resolveThemeTokens } from "./resolve-theme.js";
import { themeTokensToCssVariables } from "./to-css-variables.js";

/**
 * Applies the resolved tier's theme tokens as CSS custom properties on a
 * wrapping element, so any descendant can consume `var(--th-color-*)`
 * without importing the theme module directly (design
 * `service-tier-experience`: theme via configuration/tokens, not
 * tier-specific code branches).
 */
export function ThemeProvider({
  tier,
  children,
}: {
  tier: ServiceTier | null | undefined;
  children: ReactNode;
}) {
  const tokens = resolveThemeTokens(tier);
  const cssVariables = themeTokensToCssVariables(tokens) as CSSProperties;

  return (
    <div data-testid="theme-provider" style={cssVariables}>
      {children}
    </div>
  );
}
