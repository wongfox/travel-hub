import { useTranslation } from "react-i18next";
import type { ApiClient } from "../../shared/api/client.js";
import { useOfflineTripQuery } from "../../shared/trip/use-offline-trip-query.js";
import { resolveTripTier } from "../../shared/trip/resolve-trip-tier.js";
import { ThemeProvider } from "../../shared/theme/theme-provider.js";
import { FreshnessBanner } from "../../shared/offline/freshness-banner.js";
import { ItineraryTimeline } from "./itinerary-timeline.js";
import { OfflineItineraryTimeline } from "./offline-itinerary-timeline.js";

export interface ItineraryPageProps {
  apiClient: ApiClient;
}

/**
 * `trip-itinerary` container (task 6.5, extended by task 7.1 for offline
 * fallback): fetches `GET /api/trip` (shared with `trip-home`/
 * `travel-documents` via `useTripQuery`'s common query key) through
 * `useOfflineTripQuery`, and renders the tier-themed timeline. When the live
 * fetch fails but a cached `TripSnapshot` exists for the device's active
 * link, renders the narrower offline timeline plus a freshness banner
 * instead of an error (spec `offline-trip-data` "Trip data accessible with
 * no connectivity" / "Stale data flagged while offline").
 */
export function ItineraryPage({ apiClient }: ItineraryPageProps) {
  const { t } = useTranslation();
  const state = useOfflineTripQuery(apiClient);

  if (state.status === "loading") {
    return <p role="status">{t("trip.loading")}</p>;
  }

  if (state.status === "unavailable") {
    return <p role="alert">{t("trip.loadError")}</p>;
  }

  if (state.status === "cache") {
    const tier = resolveTripTier(state.snapshot.legs, null);
    return (
      <ThemeProvider tier={tier}>
        <h2>{t("itinerary.heading")}</h2>
        <FreshnessBanner fetchedAt={state.snapshot.fetchedAt} />
        <OfflineItineraryTimeline legs={state.snapshot.legs} />
        <nav>
          <a href="/trip">{t("nav.home")}</a>
          <a href="/trip/documents">{t("nav.documents")}</a>
        </nav>
      </ThemeProvider>
    );
  }

  const trip = state.trip;
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
