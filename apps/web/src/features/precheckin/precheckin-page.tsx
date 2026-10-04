import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import type { ApiClient } from "../../shared/api/client.js";
import { TRIP_QUERY_KEY, useTripQuery } from "../../shared/trip/use-trip-query.js";
import { resolveTripTier } from "../../shared/trip/resolve-trip-tier.js";
import { ThemeProvider } from "../../shared/theme/theme-provider.js";
import { Button } from "../../shared/ui/atoms/button.js";
import { Icon } from "../../shared/ui/atoms/icon.js";
import { EmptyState } from "../../shared/ui/atoms/empty-state.js";
import { LoadingState } from "../../shared/ui/atoms/loading-state.js";
import { PageError } from "../../shared/ui/atoms/page-error.js";
import { StatusPanel } from "../../shared/ui/atoms/status-panel.js";
import { Alert } from "../../shared/ui/atoms/alert.js";
import { ServicePage } from "../../shared/ui/templates/service-page.js";
import type { MediaDevicesLike } from "./capture/camera-capture.js";
import { PrecheckinConsentGate } from "./consent/precheckin-consent-gate.js";
import { PrecheckinSubmissionFlow } from "./precheckin-submission-flow.js";

export interface PrecheckinPageProps {
  apiClient: ApiClient;
  /** Injectable for tests; defaults to `navigator.mediaDevices`. */
  mediaDevices?: MediaDevicesLike;
}

/**
 * `pre-check-in` container: respects the server-resolved
 * `precheckin.capture_ui` flag the same way `PushPage`/`PulsePage` respect
 * theirs, and stays unavailable (never an invented consent) when the BFF
 * publishes no `consentTextVersions.precheckin`.
 *
 * Pre check-in is per passenger (the BFF's `POST /api/precheckin/:passengerOrdinal`
 * and `TripDTO.passengers[].precheckinStatus`): a reservation with several
 * passengers lists them and each pending one is completed separately; a
 * single-passenger reservation goes straight to consent. Whether it is
 * required per booking instead is a TBD spec item; nothing here assumes it.
 * The biometric consent is never cached (no `cacheScope`), so it is asked for
 * every passenger and every visit. Completed passengers only ever show a
 * status, never the submitted images.
 *
 * TODO(legal): the `precheckin.page.*` copy is provisional.
 */
export function PrecheckinPage({ apiClient, mediaDevices }: PrecheckinPageProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const tripQuery = useTripQuery(apiClient);
  const [selectedOrdinal, setSelectedOrdinal] = useState<number | null>(null);
  const [justSubmitted, setJustSubmitted] = useState<ReadonlySet<number>>(new Set());

  if (tripQuery.isPending) {
    return <LoadingState label={t("trip.loading")} skeletons={2} />;
  }

  if (tripQuery.isError) {
    return <PageError>{t("trip.loadError")}</PageError>;
  }

  const trip = tripQuery.data;
  const tier = resolveTripTier(trip.legs, trip.nextMilestone);
  const consentTextVersion = trip.consentTextVersions?.precheckin;
  const available = trip.features.precheckinCaptureUi && Boolean(consentTextVersion);

  if (!available || !consentTextVersion) {
    return (
      <ThemeProvider tier={tier}>
        <ServicePage title={t("precheckin.page.heading")} icon="precheckin">
          <EmptyState icon="precheckin">{t("precheckin.page.unavailable")}</EmptyState>
        </ServicePage>
      </ThemeProvider>
    );
  }

  const passengers = trip.passengers;
  const effectiveOrdinal = selectedOrdinal ?? (passengers.length === 1 ? passengers[0]!.ordinal : null);
  const selected = passengers.find((passenger) => passenger.ordinal === effectiveOrdinal) ?? null;
  const hasPendingOthers = passengers.some(
    (passenger) =>
      passenger.ordinal !== effectiveOrdinal &&
      passenger.precheckinStatus === "none" &&
      !justSubmitted.has(passenger.ordinal),
  );

  function handleSubmitted(ordinal: number): void {
    setJustSubmitted((previous) => new Set(previous).add(ordinal));
    void queryClient.invalidateQueries({ queryKey: TRIP_QUERY_KEY });
  }

  let body;
  if (selected && justSubmitted.has(selected.ordinal)) {
    body = (
      <div className="stack">
        <StatusPanel tone="success" role="status">
          <p>{t("precheckin.page.received")}</p>
        </StatusPanel>
        {hasPendingOthers && (
          <Button variant="secondary" block onClick={() => setSelectedOrdinal(null)}>
            {t("precheckin.page.choose")}
          </Button>
        )}
      </div>
    );
  } else if (selected && selected.precheckinStatus !== "none") {
    body = (
      <StatusPanel tone="success" role="status">
        <p>{t(`precheckin.page.status.${selected.precheckinStatus}`)}</p>
        <p>{t("precheckin.page.statusOnly")}</p>
      </StatusPanel>
    );
  } else if (selected) {
    body = (
      <PrecheckinConsentGate
        key={selected.ordinal}
        apiClient={apiClient}
        consentTextVersion={consentTextVersion}
      >
        {({ consentRecordId, onConsentRequired }) =>
          consentRecordId ? (
            <PrecheckinSubmissionFlow
              apiClient={apiClient}
              passengerOrdinal={selected.ordinal}
              consentRecordId={consentRecordId}
              onConsentRequired={onConsentRequired}
              onSubmitted={() => handleSubmitted(selected.ordinal)}
              {...(mediaDevices ? { mediaDevices } : {})}
            />
          ) : (
            <Alert tone="error">{t("precheckin.page.unavailable")}</Alert>
          )
        }
      </PrecheckinConsentGate>
    );
  } else {
    body = (
      <div className="stack">
        <p className="lead">{t("precheckin.page.choosePassenger")}</p>
        <ul className="passenger-cards">
          {passengers.map((passenger) => {
            const status = justSubmitted.has(passenger.ordinal) ? "received" : passenger.precheckinStatus;
            return (
              <li key={passenger.ordinal} className="passenger-card">
                <div className="passenger-card__row">
                  <span className="passenger-card__avatar">
                    <Icon name="user" size={22} />
                  </span>
                  <span className="passenger-card__name">{passenger.displayName}</span>
                  <span className="badge" data-tone={status === "none" ? "neutral" : "success"}>
                    {t(`precheckin.page.status.${status}`)}
                  </span>
                </div>
                {status === "none" && (
                  <Button block onClick={() => setSelectedOrdinal(passenger.ordinal)}>
                    {t("precheckin.page.start", { name: passenger.displayName })}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <ThemeProvider tier={tier}>
      <ServicePage title={t("precheckin.page.heading")} icon="precheckin" current="precheckin" showPrecheckin>
        {body}
      </ServicePage>
    </ThemeProvider>
  );
}
