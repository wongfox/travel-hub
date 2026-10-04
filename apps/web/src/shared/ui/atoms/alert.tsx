import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon.js";

export type AlertTone = "info" | "warning" | "error" | "success";

const TONE_ICON: Record<AlertTone, IconName> = {
  info: "info",
  warning: "alert",
  error: "alert",
  success: "check",
};

/**
 * Banner message. Warnings and errors default to `role="alert"` (assertive),
 * info and success to `role="status"` (polite); pass `role` to override when a
 * screen's contract needs the other live-region behavior.
 */
export function Alert({
  tone,
  role,
  children,
  testId,
}: {
  tone: AlertTone;
  role?: "alert" | "status";
  children: ReactNode;
  testId?: string;
}) {
  const resolvedRole = role ?? (tone === "warning" || tone === "error" ? "alert" : "status");

  return (
    <div role={resolvedRole} className={`alert alert--${tone}`} data-testid={testId}>
      <span className="alert__icon">
        <Icon name={TONE_ICON[tone]} />
      </span>
      <div className="alert__body">{children}</div>
    </div>
  );
}
