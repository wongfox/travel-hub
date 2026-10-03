import { useTranslation } from "react-i18next";
import type { Locale } from "contracts";
import type { ApiClient } from "../../shared/api/client.js";
import { useTripQuery } from "../../shared/trip/use-trip-query.js";
import { resolveTripTier } from "../../shared/trip/resolve-trip-tier.js";
import { ThemeProvider } from "../../shared/theme/theme-provider.js";
import type { PushEligibilityEnv } from "../../shared/push/push-eligibility.js";
import { PushOptIn } from "./push-opt-in.js";

export interface PushPageProps {
  apiClient: ApiClient;
  /** Injectable seam for deterministic tests; defaults to `PushOptIn`'s own real browser detection. */
  env?: PushEligibilityEnv;
}

/**
 * `push-notifications` container (task 11.3): respects the server-resolved
 * `push.enabled` kill switch the same way `WifiPage` respects
 * `wifi.checkout` — an unavailable message, not a generic error, when the
 * flag is off — on top of `PushOptIn`'s own independent browser-eligibility
 * gating.
 */
export function PushPage({ apiClient, env }: PushPageProps) {
  const { t, i18n } = useTranslation();
  const tripQuery = useTripQuery(apiClient);

  if (tripQuery.isPending) {
    return <p role="status">{t("trip.loading")}</p>;
  }

  if (tripQuery.isError) {
    return <p role="alert">{t("trip.loadError")}</p>;
  }

  const trip = tripQuery.data;
  const tier = resolveTripTier(trip.legs, trip.nextMilestone);

  return (
    <ThemeProvider tier={tier}>
      <h2>{t("push.heading")}</h2>
      {trip.features.pushEnabled ? (
        <PushOptIn
          apiClient={apiClient}
          a2hsPromptEnabled={trip.features.pushA2hsPrompt}
          locale={i18n.language as Locale}
          {...(env ? { env } : {})}
        />
      ) : (
        <p>{t("push.unavailable")}</p>
      )}
      <nav>
        <a href="/trip">{t("nav.home")}</a>
      </nav>
    </ThemeProvider>
  );
}
