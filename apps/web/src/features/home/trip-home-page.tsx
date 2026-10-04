import { useTranslation } from "react-i18next";
import type { ApiClient } from "../../shared/api/client.js";
import { useTripQuery } from "../../shared/trip/use-trip-query.js";
import { resolveTripTier } from "../../shared/trip/resolve-trip-tier.js";
import { ThemeProvider } from "../../shared/theme/theme-provider.js";
import { isPrecheckinOffered } from "../../shared/trip/is-precheckin-offered.js";
import { Alert } from "../../shared/ui/atoms/alert.js";
import { LoadingState } from "../../shared/ui/atoms/loading-state.js";
import { TripTabBar } from "../../shared/ui/molecules/trip-tab-bar.js";
import { resolveTripStatus } from "./resolve-trip-status.js";
import { TripStatusBanner } from "./trip-status-banner.js";
import { ServicesGrid } from "./services-grid.js";
import { RelocationAlerts } from "./relocation-alerts.js";

export interface TripHomePageProps {
  apiClient: ApiClient;
}

/**
 * `trip-home` container (task 6.5): fetches `GET /api/trip` (6.2) and renders
 * the tier-themed status/next-milestone module plus the relocation/incident
 * banner. Plain `<a>` navigation (not TanStack Router's `Link`) is used for
 * the itinerary/documents links deliberately — it keeps this container
 * testable and decoupled from a router context, at the cost of a full
 * navigation between these three pages instead of a client-side transition;
 * an acceptable MVP tradeoff, revisit if that transition cost matters later.
 */
export function TripHomePage({ apiClient }: TripHomePageProps) {
  const { t } = useTranslation();
  const query = useTripQuery(apiClient);

  if (query.isPending) {
    return <LoadingState label={t("trip.loading")} skeletons={2} />;
  }

  if (query.isError) {
    return (
      <div className="page">
        <Alert tone="error">{t("trip.loadError")}</Alert>
      </div>
    );
  }

  const trip = query.data;
  const tier = resolveTripTier(trip.legs, trip.nextMilestone);
  const status = resolveTripStatus(trip.legs, trip.nextMilestone !== null);

  return (
    <ThemeProvider tier={tier}>
      <div className="page">
        <RelocationAlerts alerts={trip.alerts} />
        <TripStatusBanner
          status={status}
          nextMilestone={trip.nextMilestone}
          legs={trip.legs}
          tier={tier}
          passengers={trip.passengers}
        />
        <ServicesGrid trip={trip} />
      </div>
      <TripTabBar current="home" showPrecheckin={isPrecheckinOffered(trip)} />
    </ThemeProvider>
  );
}
