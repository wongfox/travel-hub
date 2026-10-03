import { useTranslation } from "react-i18next";
import type { ApiClient } from "../../shared/api/client.js";
import { useTripQuery } from "../../shared/trip/use-trip-query.js";
import { resolveTripTier } from "../../shared/trip/resolve-trip-tier.js";
import { ThemeProvider } from "../../shared/theme/theme-provider.js";
import { ItineraryTimeline } from "./itinerary-timeline.js";

export interface ItineraryPageProps {
  apiClient: ApiClient;
}

/**
 * `trip-itinerary` container (task 6.5): fetches `GET /api/trip` (shared
 * with `trip-home`/`travel-documents` via `useTripQuery`'s common query key)
 * and renders the tier-themed timeline.
 */
export function ItineraryPage({ apiClient }: ItineraryPageProps) {
  const { t } = useTranslation();
  const query = useTripQuery(apiClient);

  if (query.isPending) {
    return <p role="status">{t("trip.loading")}</p>;
  }

  if (query.isError) {
    return <p role="alert">{t("trip.loadError")}</p>;
  }

  const trip = query.data;
  const tier = resolveTripTier(trip.legs, trip.nextMilestone);

  return (
    <ThemeProvider tier={tier}>
      <h2>{t("itinerary.heading")}</h2>
      <ItineraryTimeline legs={trip.legs} documents={trip.documents} nextMilestone={trip.nextMilestone} />
      <nav>
        <a href="/trip">{t("nav.home")}</a>
        <a href="/trip/documents">{t("nav.documents")}</a>
      </nav>
    </ThemeProvider>
  );
}
