import type { ReactNode } from "react";

/**
 * Smallest reusable "pill" label (atomic-design atom). Colors come from the
 * active theme's CSS custom properties (`shared/theme`) rather than
 * hardcoded values, so it automatically follows tier theming wherever it
 * is rendered inside a `ThemeProvider`.
 */
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent";
}) {
  return (
    <span
      data-testid="badge"
      data-tone={tone}
      style={{
        backgroundColor: tone === "accent" ? "var(--th-color-accent)" : "var(--th-color-secondary)",
        color: "var(--th-color-background)",
        borderRadius: "9999px",
        padding: "0.125rem 0.625rem",
        fontSize: "0.75rem",
      }}
    >
      {children}
    </span>
  );
}
