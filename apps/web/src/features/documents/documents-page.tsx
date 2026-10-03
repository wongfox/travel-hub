import { useTranslation } from "react-i18next";
import type { ApiClient } from "../../shared/api/client.js";
import { useTripQuery } from "../../shared/trip/use-trip-query.js";
import { resolveTripTier } from "../../shared/trip/resolve-trip-tier.js";
import { ThemeProvider } from "../../shared/theme/theme-provider.js";
import { TicketList } from "./ticket-list.js";

export interface DocumentsPageProps {
  apiClient: ApiClient;
}

/**
 * `travel-documents` container (task 6.5): fetches `GET /api/trip` (shared
 * with `trip-home`/`trip-itinerary` via `useTripQuery`'s common query key)
 * and renders the tier-themed ticket list.
 */
export function DocumentsPage({ apiClient }: DocumentsPageProps) {
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
      <h2>{t("documents.heading")}</h2>
      <TicketList documents={trip.documents} />
      <nav>
        <a href="/trip">{t("nav.home")}</a>
        <a href="/trip/itinerary">{t("nav.itinerary")}</a>
      </nav>
    </ThemeProvider>
  );
}
