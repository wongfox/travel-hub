import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import type { ApiClient } from "../../shared/api/client.js";
import { TRIP_QUERY_KEY, useTripQuery } from "../../shared/trip/use-trip-query.js";
import { resolveTripTier } from "../../shared/trip/resolve-trip-tier.js";
import { ThemeProvider } from "../../shared/theme/theme-provider.js";
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
    return <p role="status">{t("trip.loading")}</p>;
  }

  if (tripQuery.isError) {
    return <p role="alert">{t("trip.loadError")}</p>;
  }

  const trip = tripQuery.data;
  const tier = resolveTripTier(trip.legs, trip.nextMilestone);
  const consentTextVersion = trip.consentTextVersions?.precheckin;
  const available = trip.features.precheckinCaptureUi && Boolean(consentTextVersion);

  const nav = (
    <nav>
      <a href="/trip">{t("nav.home")}</a>
    </nav>
  );

  if (!available || !consentTextVersion) {
    return (
      <ThemeProvider tier={tier}>
        <h2>{t("precheckin.page.heading")}</h2>
        <p>{t("precheckin.page.unavailable")}</p>
        {nav}
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
      <div>
        <p role="status">{t("precheckin.page.received")}</p>
        {hasPendingOthers && (
          <button type="button" onClick={() => setSelectedOrdinal(null)}>
            {t("precheckin.page.choose")}
          </button>
        )}
      </div>
    );
  } else if (selected && selected.precheckinStatus !== "none") {
    body = (
      <div role="status">
        <p>{t(`precheckin.page.status.${selected.precheckinStatus}`)}</p>
        <p>{t("precheckin.page.statusOnly")}</p>
      </div>
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
            <p role="alert">{t("precheckin.page.unavailable")}</p>
          )
        }
      </PrecheckinConsentGate>
    );
  } else {
    body = (
      <div>
        <p>{t("precheckin.page.choosePassenger")}</p>
        <ul>
          {passengers.map((passenger) => {
            const status = justSubmitted.has(passenger.ordinal) ? "received" : passenger.precheckinStatus;
            return (
              <li key={passenger.ordinal}>
                <span>{passenger.displayName}</span> <span>{t(`precheckin.page.status.${status}`)}</span>
                {status === "none" && (
                  <button type="button" onClick={() => setSelectedOrdinal(passenger.ordinal)}>
                    {t("precheckin.page.start", { name: passenger.displayName })}
                  </button>
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
      <h2>{t("precheckin.page.heading")}</h2>
      {body}
      {nav}
    </ThemeProvider>
  );
}
