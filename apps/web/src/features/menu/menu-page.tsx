import { useTranslation } from "react-i18next";
import type { ApiClient } from "../../shared/api/client.js";
import { useMenuQuery } from "../../shared/content/use-content-queries.js";
import { useTripQuery } from "../../shared/trip/use-trip-query.js";
import { resolveTripTier } from "../../shared/trip/resolve-trip-tier.js";
import { ThemeProvider } from "../../shared/theme/theme-provider.js";
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
    return <p role="status">{t("trip.loading")}</p>;
  }

  if (menuQuery.isError) {
    return <p role="alert">{t("trip.loadError")}</p>;
  }

  const tier = tripQuery.data ? resolveTripTier(tripQuery.data.legs, tripQuery.data.nextMilestone) : undefined;

  return (
    <ThemeProvider tier={tier}>
      <h2>{t("menu.heading")}</h2>
      <MenuSections sections={menuQuery.data.data} />
      <nav>
        <a href="/trip">{t("nav.home")}</a>
      </nav>
    </ThemeProvider>
  );
}
