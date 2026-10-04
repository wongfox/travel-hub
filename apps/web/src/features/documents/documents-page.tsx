import { useTranslation } from "react-i18next";
import type { ApiClient } from "../../shared/api/client.js";
import { useOfflineTripQuery } from "../../shared/trip/use-offline-trip-query.js";
import { resolveTripTier } from "../../shared/trip/resolve-trip-tier.js";
import { ThemeProvider } from "../../shared/theme/theme-provider.js";
import { FreshnessBanner } from "../../shared/offline/freshness-banner.js";
import { isPrecheckinOffered } from "../../shared/trip/is-precheckin-offered.js";
import { Alert } from "../../shared/ui/atoms/alert.js";
import { LoadingState } from "../../shared/ui/atoms/loading-state.js";
import { TripTabBar } from "../../shared/ui/molecules/trip-tab-bar.js";
import { TicketList } from "./ticket-list.js";
import { OfflineTicketList } from "./offline-ticket-list.js";

export interface DocumentsPageProps {
  apiClient: ApiClient;
}

/**
 * `travel-documents` container (task 6.5, extended by task 7.1 for offline
 * fallback): fetches `GET /api/trip` (shared with `trip-home`/
 * `trip-itinerary` via `useTripQuery`'s common query key) through
 * `useOfflineTripQuery`, and renders the tier-themed ticket list. When the
 * live fetch fails but a cached `TripSnapshot` exists for the device's
 * active link, renders the narrower offline ticket list plus a freshness
 * banner instead of an error (spec `offline-trip-data` "Trip data
 * accessible with no connectivity").
 */
export function DocumentsPage({ apiClient }: DocumentsPageProps) {
  const { t } = useTranslation();
  const state = useOfflineTripQuery(apiClient);

  if (state.status === "loading") {
    return <LoadingState label={t("trip.loading")} skeletons={2} />;
  }

  if (state.status === "unavailable") {
    return (
      <div className="page">
        <Alert tone="error">{t("trip.loadError")}</Alert>
      </div>
    );
  }

  if (state.status === "cache") {
    const tier = resolveTripTier(state.snapshot.legs, null);
    return (
      <ThemeProvider tier={tier}>
        <div className="page">
          <h2 className="page__title">{t("documents.heading")}</h2>
          <FreshnessBanner fetchedAt={state.snapshot.fetchedAt} />
          <OfflineTicketList tickets={state.snapshot.tickets} />
        </div>
        <TripTabBar current="documents" />
      </ThemeProvider>
    );
  }

  const trip = state.trip;
  const tier = resolveTripTier(trip.legs, trip.nextMilestone);

  return (
    <ThemeProvider tier={tier}>
      <div className="page">
        <h2 className="page__title">{t("documents.heading")}</h2>
        <TicketList documents={trip.documents} />
      </div>
      <TripTabBar current="documents" showPrecheckin={isPrecheckinOffered(trip)} />
    </ThemeProvider>
  );
}
