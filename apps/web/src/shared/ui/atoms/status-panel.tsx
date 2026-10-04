import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon.js";

export type StatusPanelTone = "success" | "pending" | "error";

const TONE_ICON: Record<StatusPanelTone, IconName> = { success: "check", pending: "clock", error: "alert" };

/**
 * Large centered outcome panel (a big tinted icon over the message), used for
 * result screens such as the WiFi purchase return view. The caller picks the
 * live-region `role` its contract needs (`status` for progress/success,
 * `alert` for failures).
 */
export function StatusPanel({
  tone,
  role,
  children,
}: {
  tone: StatusPanelTone;
  role: "status" | "alert";
  children: ReactNode;
}) {
  return (
    <div role={role} className={`status-panel status-panel--${tone}`}>
      <span className="status-panel__icon">
        <Icon name={TONE_ICON[tone]} size={32} />
      </span>
      <div className="status-panel__body">{children}</div>
    </div>
  );
}
