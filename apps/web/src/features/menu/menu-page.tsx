import { useTranslation } from "react-i18next";
import type { ApiClient } from "../../shared/api/client.js";
import { useMenuQuery } from "../../shared/content/use-content-queries.js";
import { useTripQuery } from "../../shared/trip/use-trip-query.js";
import { resolveTripTier } from "../../shared/trip/resolve-trip-tier.js";
import { ThemeProvider } from "../../shared/theme/theme-provider.js";
import { isPrecheckinOffered } from "../../shared/trip/is-precheckin-offered.js";
import { LoadingState } from "../../shared/ui/atoms/loading-state.js";
import { PageError } from "../../shared/ui/atoms/page-error.js";
import { ServicePage } from "../../shared/ui/templates/service-page.js";
import { MenuSections } from "./menu-sections.js";

export interface MenuPageProps {
  apiClient: ApiClient;
}

/**
 * `onboard-menu` container (task 9.3): read-only, tier+locale-scoped menu
 * content. Consultation only — no purchase action anywhere, a locked design
 * decision enforced by `MenuItemSchema`'s `.strict()` and by `MenuSections`
 * never rendering one.
 */
export function MenuPage({ apiClient }: MenuPageProps) {
  const { t } = useTranslation();
  const menuQuery = useMenuQuery(apiClient);
  const tripQuery = useTripQuery(apiClient);

  if (menuQuery.isPending) {
    return <LoadingState label={t("trip.loading")} skeletons={2} />;
  }

  if (menuQuery.isError) {
    return <PageError>{t("trip.loadError")}</PageError>;
  }

  const tier = tripQuery.data ? resolveTripTier(tripQuery.data.legs, tripQuery.data.nextMilestone) : undefined;

  return (
    <ThemeProvider tier={tier}>
      <ServicePage
        title={t("menu.heading")}
        icon="menu"
        showPrecheckin={tripQuery.data ? isPrecheckinOffered(tripQuery.data) : false}
      >
        <MenuSections sections={menuQuery.data.data} />
      </ServicePage>
    </ThemeProvider>
  );
}
