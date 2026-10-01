import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, type ApiClient } from "../../shared/api/client.js";
import { useTripQuery } from "../../shared/trip/use-trip-query.js";
import { resolveTripTier } from "../../shared/trip/resolve-trip-tier.js";
import { ThemeProvider } from "../../shared/theme/theme-provider.js";
import {
  useCreateWifiOrderMutation,
  useWifiOrderStatusQuery,
  useWifiPackagesQuery,
} from "../../shared/wifi/use-wifi-queries.js";
import { rememberWifiOrderId, resolveWifiOrderId } from "../../shared/wifi/wifi-order-session.js";
import { WifiCatalog } from "./wifi-catalog.js";
import { WifiEntitlementStatus } from "./wifi-entitlement-status.js";
import { TfeLink } from "../tfe/tfe-link.js";

export interface WifiPageProps {
  apiClient: ApiClient;
  /** Injectable seam for deterministic tests; defaults to the real browser query string. */
  getSearch?: () => string;
  /** Injectable seam for deterministic tests; defaults to a real full-page navigation (leaving the app for the gateway's hosted page). */
  redirectTo?: (url: string) => void;
  /** Injectable seam for deterministic tests; defaults to a real random UUID per checkout attempt. */
  generateIdempotencyKey?: () => string;
}

/**
 * `wifi-package-checkout` container (task 10.4): catalog + checkout when
 * reached directly, or the return-URL landing view when reached with
 * `?order=<idempotencyKey>` (the shape `buildReturnUrl`, `wifi-checkout/
 * http.ts`, actually sends — see `shared/wifi/wifi-order-session.ts` for why
 * that is the idempotency key, not the order id).
 *
 * The independent `wifi.checkout` kill switch (acceptance criterion) is
 * enforced server-side only (`feature_disabled`, 403, on every wifi-checkout
 * route) — this container never duplicates that decision client-side; it
 * only ever reacts to the 403 by showing an unavailable state instead of a
 * generic load error, same as the design's documented error-envelope
 * contract (the server decides, the UI translates).
 */
export function WifiPage({
  apiClient,
  getSearch = () => window.location.search,
  redirectTo = (url: string) => {
    window.location.href = url;
  },
  generateIdempotencyKey = () => crypto.randomUUID(),
}: WifiPageProps) {
  const { t } = useTranslation();
  const [returnIdempotencyKey] = useState<string | null>(() => new URLSearchParams(getSearch()).get("order"));
  const [returnOrderId] = useState<string | null>(() =>
    returnIdempotencyKey ? resolveWifiOrderId(returnIdempotencyKey) : null,
  );
  const tripQuery = useTripQuery(apiClient);
  const tier = tripQuery.data ? resolveTripTier(tripQuery.data.legs, tripQuery.data.nextMilestone) : undefined;

  const orderStatusQuery = useWifiOrderStatusQuery(apiClient, returnOrderId);
  const packagesQuery = useWifiPackagesQuery(apiClient);
  const createOrderMutation = useCreateWifiOrderMutation(apiClient);

  if (returnIdempotencyKey) {
    if (!returnOrderId) {
      return <p role="alert">{t("wifi.orderStatus.notFound")}</p>;
    }
    if (orderStatusQuery.isPending) {
      return <p role="status">{t("wifi.orderStatus.checking")}</p>;
    }
    if (orderStatusQuery.isError) {
      return <p role="alert">{t("trip.loadError")}</p>;
    }
    return (
      <ThemeProvider tier={tier}>
        <WifiEntitlementStatus order={orderStatusQuery.data} />
      </ThemeProvider>
    );
  }

  if (packagesQuery.isPending) {
    return <p role="status">{t("trip.loading")}</p>;
  }

  if (packagesQuery.isError) {
    if (packagesQuery.error instanceof ApiError && packagesQuery.error.code === "feature_disabled") {
      return <p>{t("wifi.unavailable")}</p>;
    }
    return <p role="alert">{t("trip.loadError")}</p>;
  }

  function handleBuy(packageId: string): void {
    const idempotencyKey = generateIdempotencyKey();
    createOrderMutation.mutate(
      { packageId, idempotencyKey },
      {
        onSuccess: ({ order, redirectUrl }) => {
          rememberWifiOrderId(idempotencyKey, order.id);
          redirectTo(redirectUrl);
        },
      },
    );
  }

  return (
    <ThemeProvider tier={tier}>
      <h2>{t("wifi.heading")}</h2>
      <WifiCatalog packages={packagesQuery.data} onBuy={handleBuy} isBuying={createOrderMutation.isPending} />
      {createOrderMutation.isError && <p role="alert">{t("wifi.checkoutError")}</p>}
      {/*
        `complementary-services-redirect` (task 10.5): the design does not
        name a specific placement location, only that a `tfe` web feature
        triggers the redirect — the WiFi catalog is a narrowly-scoped,
        documented choice of touchpoint (a passenger already engaging with
        a paid onboard service is a reasonable complementary-services
        moment), not a business decision about where this upsell belongs.
      */}
      <TfeLink placement="home_banner">{t("tfe.cta")}</TfeLink>
      <nav>
        <a href="/trip">{t("nav.home")}</a>
      </nav>
    </ThemeProvider>
  );
}
