import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PulseScore } from "contracts";
import type { ApiClient } from "../../shared/api/client.js";
import { useTripQuery } from "../../shared/trip/use-trip-query.js";
import { resolveTripTier } from "../../shared/trip/resolve-trip-tier.js";
import { ThemeProvider } from "../../shared/theme/theme-provider.js";
import { resolvePulseTriggerLeg } from "../../shared/pulse/resolve-pulse-trigger-leg.js";
import { hasAnsweredPulseLocally, markPulseAnsweredLocally } from "../../shared/pulse/pulse-answered-storage.js";
import { requestPulsePrompt } from "../../shared/pulse/get-pulse.js";
import { useSubmitPulseResponseMutation } from "../../shared/pulse/use-pulse-mutations.js";
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
  /** A ref, not state: purely an idempotency guard for the effect below (task 11.6's "once per trigger moment"), never rendered — so it never needs to trigger a re-render or go through `setState` inside the effect body. */
  const promptRequestedForLegIdRef = useRef<string | null>(null);

  const trip = tripQuery.data;
  const triggerLeg = trip ? resolvePulseTriggerLeg(trip.legs) : null;
  const answeredLocally =
    trip !== undefined &&
    triggerLeg !== null &&
    (justAnsweredLegId === triggerLeg.id || hasAnsweredPulseLocally(trip.linkId, triggerLeg.id));

  useEffect(() => {
    if (!trip || !triggerLeg || answeredLocally) return;
    if (promptRequestedForLegIdRef.current === triggerLeg.id) return;
    promptRequestedForLegIdRef.current = triggerLeg.id;
    void requestPulsePrompt(apiClient, triggerLeg.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.linkId, triggerLeg?.id, answeredLocally]);

  if (tripQuery.isPending) {
    return <p role="status">{t("trip.loading")}</p>;
  }

  if (tripQuery.isError || !trip) {
    return <p role="alert">{t("trip.loadError")}</p>;
  }

  const tier = resolveTripTier(trip.legs, trip.nextMilestone);

  function handleSubmit(score: PulseScore): void {
    if (!triggerLeg) return;
    submitMutation.mutate(
      { legId: triggerLeg.id, score },
      {
        onSuccess: () => {
          markPulseAnsweredLocally(trip!.linkId, triggerLeg.id);
          setJustAnsweredLegId(triggerLeg.id);
        },
      },
    );
  }

  return (
    <ThemeProvider tier={tier}>
      <h2>{t("pulse.heading")}</h2>
      {!trip.features.pulseCapture ? (
        <p>{t("pulse.unavailable")}</p>
      ) : !triggerLeg ? (
        <p>{t("pulse.noMoment")}</p>
      ) : answeredLocally ? (
        <p role="status">{t("pulse.thanks")}</p>
      ) : (
        <PulsePrompt onSubmit={handleSubmit} isSubmitting={submitMutation.isPending} />
      )}
      {submitMutation.isError && <p role="alert">{t("pulse.submitError")}</p>}
      <nav>
        <a href="/trip">{t("nav.home")}</a>
      </nav>
    </ThemeProvider>
  );
}
