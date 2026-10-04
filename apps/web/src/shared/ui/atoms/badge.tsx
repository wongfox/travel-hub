import type { ReactNode } from "react";

/**
 * Smallest reusable "pill" label (atomic-design atom). Styling lives in the
 * global `.badge` class and reads the active theme's CSS custom properties
 * (`shared/theme`), so it follows tier theming wherever it is rendered inside
 * a `ThemeProvider` — `accent` uses the tier tint, `neutral` the brand neutral.
 */
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent";
}) {
  return (
    <span data-testid="badge" data-tone={tone} className="badge">
      {children}
    </span>
  );
}
