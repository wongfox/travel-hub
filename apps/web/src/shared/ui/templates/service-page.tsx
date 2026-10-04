import type { ReactNode } from "react";
import { Icon, type IconName } from "../atoms/icon.js";
import { TripTabBar, type TripTab } from "../molecules/trip-tab-bar.js";

export interface ServicePageProps {
  /** Page title: rendered as the screen's single level-2 heading. */
  title: string;
  icon: IconName;
  /** Whether the pre check-in tab is offered (caller resolves the gate from the trip, when loaded). */
  showPrecheckin?: boolean;
  /** The tab to highlight when the screen is itself a tab destination (pre check-in); none otherwise. */
  current?: TripTab | null;
  children: ReactNode;
}

/**
 * Shared layout of the secondary screens (help, menu, destination, WiFi,
 * notifications, pulse, pre check-in): a title row with the service icon, the
 * body, then the bottom tab bar with no tab highlighted. Render it inside the
 * screen's `ThemeProvider`.
 */
export function ServicePage({ title, icon, showPrecheckin = false, current = null, children }: ServicePageProps) {
  return (
    <>
      <div className="page">
        <header className="page-head">
          <span className="page-head__icon">
            <Icon name={icon} size={24} />
          </span>
          <h2 className="page__title">{title}</h2>
        </header>
        {children}
      </div>
      <TripTabBar current={current} showPrecheckin={showPrecheckin} />
    </>
  );
}
