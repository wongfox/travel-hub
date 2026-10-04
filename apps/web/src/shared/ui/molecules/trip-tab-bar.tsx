import { useTranslation } from "react-i18next";
import { Icon, type IconName } from "../atoms/icon.js";

export type TripTab = "home" | "itinerary" | "documents";

interface TabDefinition {
  id: TripTab | "precheckin";
  href: string;
  labelKey: string;
  icon: IconName;
}

const TABS: TabDefinition[] = [
  { id: "home", href: "/trip", labelKey: "nav.home", icon: "trip" },
  { id: "itinerary", href: "/trip/itinerary", labelKey: "nav.itinerary", icon: "itinerary" },
  { id: "documents", href: "/trip/documents", labelKey: "nav.documents", icon: "documents" },
];

const PRECHECKIN_TAB: TabDefinition = {
  id: "precheckin",
  href: "/trip/precheckin",
  labelKey: "nav.precheckin",
  icon: "precheckin",
};

/**
 * Bottom tab navigation for the trip core screens. Plain anchors (not the
 * router's `Link`) on purpose, matching the pages' existing navigation (see
 * `TripHomePage`): it keeps the pages router-free and unit-testable. The
 * pre check-in tab is only offered where the caller already resolved that
 * feature gate (`trip.features.precheckinCaptureUi` + published consent text).
 */
export function TripTabBar({ current, showPrecheckin = false }: { current: TripTab; showPrecheckin?: boolean }) {
  const { t } = useTranslation();
  const tabs = showPrecheckin ? [...TABS, PRECHECKIN_TAB] : TABS;

  return (
    <nav className="tab-bar">
      {tabs.map((tab) => (
        <a
          key={tab.id}
          href={tab.href}
          className="tab-bar__link"
          aria-current={tab.id === current ? "page" : undefined}
        >
          <Icon name={tab.icon} />
          <span>{t(tab.labelKey)}</span>
        </a>
      ))}
    </nav>
  );
}
