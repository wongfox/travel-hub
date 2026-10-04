import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost";

interface ButtonStyleProps {
  variant?: ButtonVariant | undefined;
  /** Stretches the button to the full width of its container. */
  block?: boolean | undefined;
}

function buttonClassName({ variant = "primary", block = false }: ButtonStyleProps, extra?: string): string {
  return ["btn", `btn--${variant}`, block ? "btn--block" : "", extra ?? ""].filter(Boolean).join(" ");
}

/**
 * Design-system button: `primary` is the brand action color (use sparingly,
 * one per view), `secondary` an outline in the tier ink, `ghost` text-only.
 * Defaults to `type="button"` so it never submits a surrounding form by accident.
 */
export function Button({
  variant,
  block,
  className,
  type = "button",
  ...rest
}: ButtonStyleProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={buttonClassName({ variant, block }, className)} {...rest} />;
}

/** An anchor that carries the button look (navigation that should read as an action). */
export function ButtonLink({
  variant,
  block,
  className,
  ...rest
}: ButtonStyleProps & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a className={buttonClassName({ variant, block }, className)} {...rest} />;
}
