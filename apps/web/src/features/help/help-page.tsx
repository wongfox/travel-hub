import { useTranslation } from "react-i18next";
import type { ApiClient } from "../../shared/api/client.js";
import { useFaqQuery } from "../../shared/content/use-content-queries.js";
import { useTripQuery } from "../../shared/trip/use-trip-query.js";
import { resolveTripTier } from "../../shared/trip/resolve-trip-tier.js";
import { ThemeProvider } from "../../shared/theme/theme-provider.js";
import { isPrecheckinOffered } from "../../shared/trip/is-precheckin-offered.js";
import { LoadingState } from "../../shared/ui/atoms/loading-state.js";
import { PageError } from "../../shared/ui/atoms/page-error.js";
import { ServicePage } from "../../shared/ui/templates/service-page.js";
import { FaqList } from "./faq-list.js";
import { WhatsAppButton } from "./whatsapp-button.js";

export interface HelpPageProps {
  apiClient: ApiClient;
}

/**
 * `help-center` container (task 9.2): managed FAQ content plus the WhatsApp
 * deep link, the sole support channel per D4 — deliberately no chat,
 * chatbot, or ticket-submission UI anywhere in this feature.
 */
export function HelpPage({ apiClient }: HelpPageProps) {
  const { t } = useTranslation();
  const faqQuery = useFaqQuery(apiClient);
  const tripQuery = useTripQuery(apiClient);

  if (faqQuery.isPending) {
    return <LoadingState label={t("trip.loading")} skeletons={2} />;
  }

  if (faqQuery.isError) {
    return <PageError>{t("trip.loadError")}</PageError>;
  }

  const tier = tripQuery.data ? resolveTripTier(tripQuery.data.legs, tripQuery.data.nextMilestone) : undefined;

  return (
    <ThemeProvider tier={tier}>
      <ServicePage
        title={t("help.heading")}
        icon="help"
        showPrecheckin={tripQuery.data ? isPrecheckinOffered(tripQuery.data) : false}
      >
        <FaqList entries={faqQuery.data.data} />
        <WhatsAppButton />
      </ServicePage>
    </ThemeProvider>
  );
}
