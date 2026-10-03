import { useTranslation } from "react-i18next";
import type { ApiClient } from "../../shared/api/client.js";
import { useDestinationQuery } from "../../shared/content/use-content-queries.js";
import { useTripQuery } from "../../shared/trip/use-trip-query.js";
import { resolveTripTier } from "../../shared/trip/resolve-trip-tier.js";
import { ThemeProvider } from "../../shared/theme/theme-provider.js";
import { PoiMap } from "./poi-map.js";

export interface DestinationPageProps {
  apiClient: ApiClient;
}

/**
 * `destination-content` container (task 9.4): the static POI map, the
 * how-to-get-there guide, and the circuit explanation — three independent
 * CMS-sourced sections, each resolved and localized on its own
 * (`ContentPort.getDestination` resolves locale fallback per section).
 */
export function DestinationPage({ apiClient }: DestinationPageProps) {
  const { t } = useTranslation();
  const poiMapQuery = useDestinationQuery(apiClient, "poi_map");
  const howToGetThereQuery = useDestinationQuery(apiClient, "how_to_get_there");
  const circuitsQuery = useDestinationQuery(apiClient, "circuits");
  const tripQuery = useTripQuery(apiClient);

  const isPending = poiMapQuery.isPending || howToGetThereQuery.isPending || circuitsQuery.isPending;
  if (isPending) {
    return <p role="status">{t("trip.loading")}</p>;
  }

  const isError = poiMapQuery.isError || howToGetThereQuery.isError || circuitsQuery.isError;
  if (isError || !poiMapQuery.data || !howToGetThereQuery.data || !circuitsQuery.data) {
    return <p role="alert">{t("trip.loadError")}</p>;
  }

  const tier = tripQuery.data ? resolveTripTier(tripQuery.data.legs, tripQuery.data.nextMilestone) : undefined;

  return (
    <ThemeProvider tier={tier}>
      <h2>{t("destination.heading")}</h2>
      <section>
        <h3>{t("destination.poiMapHeading")}</h3>
        <PoiMap mediaId={poiMapQuery.data.data.body} title={poiMapQuery.data.data.title} />
      </section>
      <section>
        <h3>{t("destination.howToGetThereHeading")}</h3>
        <p>{howToGetThereQuery.data.data.body}</p>
      </section>
      <section>
        <h3>{t("destination.circuitsHeading")}</h3>
        <p>{circuitsQuery.data.data.body}</p>
      </section>
      <nav>
        <a href="/trip">{t("nav.home")}</a>
      </nav>
    </ThemeProvider>
  );
}
