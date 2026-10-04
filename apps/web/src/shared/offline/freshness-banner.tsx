import { useTranslation } from "react-i18next";
import { Icon } from "../ui/atoms/icon.js";

export interface FreshnessBannerProps {
  /** `TripSnapshot.fetchedAt` — an ISO instant, formatted in the viewer's own local time. */
  fetchedAt: string;
}

/**
 * `offline-trip-data` freshness indicator (spec "Stale data flagged while
 * offline": "GIVEN cached trip data is older than the last successful sync
 * and the device is offline ... THEN the system displays a freshness
 * indicator"). Shown whenever a page renders from the offline `TripSnapshot`
 * instead of a live `GET /api/trip` response — cached data is, by
 * definition, always from some point in the past. `role="status"` (not
 * `alert`) since this is informational, not an error.
 */
export function FreshnessBanner({ fetchedAt }: FreshnessBannerProps) {
  const { t, i18n } = useTranslation();
  const time = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(fetchedAt),
  );

  return (
    <p role="status" className="freshness">
      <Icon name="offline" size={18} />
      {t("trip.offline.lastUpdated", { time })}
    </p>
  );
}
