import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PulseScore } from "contracts";
import { ApiError, type ApiClient } from "../../shared/api/client.js";
import { PurposeConsentGate } from "../../shared/consent/purpose-consent-gate.js";
import { useTripQuery } from "../../shared/trip/use-trip-query.js";
import { resolveTripTier } from "../../shared/trip/resolve-trip-tier.js";
import { ThemeProvider } from "../../shared/theme/theme-provider.js";
import { resolvePulseTriggerLeg } from "../../shared/pulse/resolve-pulse-trigger-leg.js";
import { hasAnsweredPulseLocally, markPulseAnsweredLocally } from "../../shared/pulse/pulse-answered-storage.js";
import { requestPulsePrompt } from "../../shared/pulse/get-pulse.js";
import { useSubmitPulseResponseMutation } from "../../shared/pulse/use-pulse-mutations.js";
import { isPrecheckinOffered } from "../../shared/trip/is-precheckin-offered.js";
import { EmptyState } from "../../shared/ui/atoms/empty-state.js";
import { LoadingState } from "../../shared/ui/atoms/loading-state.js";
import { PageError } from "../../shared/ui/atoms/page-error.js";
import { ServicePage } from "../../shared/ui/templates/service-page.js";
import { Alert } from "../../shared/ui/atoms/alert.js";
import { StatusPanel } from "../../shared/ui/atoms/status-panel.js";
import { PulsePrompt } from "./pulse-prompt.js";

export interface PulsePageProps {
  apiClient: ApiClient;
}

/**
 * `experience-pulse` container (task 11.6): respects the server-resolved
 * `pulse.capture` kill switch the same way `PushPage`/`WifiPage` respect
 * their own flags. Delivery is deliberately two independent paths: the
 * in-app prompt below renders unconditionally once a trigger moment is
 * detected (the baseline), and a separate, best-effort `POST
 * /api/pulse/prompt` call (task 11.6's own independent push path — never
 * `dispatch-journey-events.ts`'s pipeline) additionally nudges an opted-in
 * passenger via push. "Already answered" is tracked client-side
 * (`pulse-answered-storage.ts`) since the design's HTTP surface has no `GET`
 * status endpoint for pulse responses.
 */
export function PulsePage({ apiClient }: PulsePageProps) {
  const { t } = useTranslation();
  const tripQuery = useTripQuery(apiClient);
  const submitMutation = useSubmitPulseResponseMutation(apiClient);
  /** Set only by this submission's own success handler — never by the effect below (avoids syncing derived state from a read inside an effect). */
  const [justAnsweredLegId, setJustAnsweredLegId] = useState<string | null>(null);
  const trip = tripQuery.data;
  const triggerLeg = trip ? resolvePulseTriggerLeg(trip.legs) : null;
  const answeredLocally =
    trip !== undefined &&
    triggerLeg !== null &&
    (justAnsweredLegId === triggerLeg.id || hasAnsweredPulseLocally(trip.linkId, triggerLeg.id));

  if (tripQuery.isPending) {
    return <LoadingState label={t("trip.loading")} skeletons={1} />;
  }

  if (tripQuery.isError || !trip) {
    return <PageError>{t("trip.loadError")}</PageError>;
  }

  const tier = resolveTripTier(trip.legs, trip.nextMilestone);
  // No version published by the BFF means no consent text to record against,
  // so the survey stays unavailable rather than inventing a version.
  const pulseConsentTextVersion = trip.consentTextVersions?.pulse;

  function handleSubmit(score: PulseScore, onConsentRequired: () => void): void {
    if (!triggerLeg) return;
    submitMutation.mutate(
      { legId: triggerLeg.id, score },
      {
        onSuccess: () => {
          markPulseAnsweredLocally(trip!.linkId, triggerLeg.id);
          setJustAnsweredLegId(triggerLeg.id);
        },
        onError: (error) => {
          if (error instanceof ApiError && error.code === "consent_required") {
            submitMutation.reset();
            onConsentRequired();
          }
        },
      },
    );
  }

  return (
    <ThemeProvider tier={tier}>
      <ServicePage title={t("pulse.heading")} icon="pulse" showPrecheckin={isPrecheckinOffered(trip)}>
      {!trip.features.pulseCapture || !pulseConsentTextVersion ? (
        <EmptyState icon="pulse">{t("pulse.unavailable")}</EmptyState>
      ) : !triggerLeg ? (
        <EmptyState icon="pulse">{t("pulse.noMoment")}</EmptyState>
      ) : answeredLocally ? (
        <StatusPanel tone="success" role="status">
          <p>{t("pulse.thanks")}</p>
        </StatusPanel>
      ) : (
        <PurposeConsentGate
          apiClient={apiClient}
          purpose="pulse"
          textVersion={pulseConsentTextVersion}
          i18nPrefix="consent.pulse"
          cacheScope={trip.linkId}
        >
          {({ onConsentRequired }) => (
            <ConsentedPulsePrompt
              apiClient={apiClient}
              legId={triggerLeg.id}
              isSubmitting={submitMutation.isPending}
              onSubmit={(score) => handleSubmit(score, onConsentRequired)}
              onConsentRequired={onConsentRequired}
            />
          )}
        </PurposeConsentGate>
      )}
      {submitMutation.isError && <Alert tone="error">{t("pulse.submitError")}</Alert>}
      </ServicePage>
    </ThemeProvider>
  );
}

interface ConsentedPulsePromptProps {
  apiClient: ApiClient;
  legId: string;
  isSubmitting: boolean;
  onSubmit: (score: PulseScore) => void;
  onConsentRequired: () => void;
}

/**
 * Rendered only once `pulse` consent is recorded (inside `PurposeConsentGate`),
 * so the best-effort `POST /api/pulse/prompt` push nudge also only ever
 * follows consent. It fires once per trigger leg; a 403 `consent_required`
 * (consent withdrawn or cache stale) re-shows the gate, any other failure
 * stays a silent no-op as before.
 */
function ConsentedPulsePrompt({ apiClient, legId, isSubmitting, onSubmit, onConsentRequired }: ConsentedPulsePromptProps) {
  useEffect(() => {
    requestPulsePrompt(apiClient, legId).catch((error: unknown) => {
      if (error instanceof ApiError && error.code === "consent_required") {
        onConsentRequired();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legId]);

  return <PulsePrompt onSubmit={onSubmit} isSubmitting={isSubmitting} />;
}
