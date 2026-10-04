import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon.js";

/**
 * Calm "nothing here / not available" panel: a muted icon over a short
 * message inside a dashed card. Not a live region (it is a state, not news);
 * pass the message as children.
 */
export function EmptyState({ icon = "info", children }: { icon?: IconName; children: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon">
        <Icon name={icon} size={28} />
      </span>
      <p className="empty-state__text">{children}</p>
    </div>
  );
}
