import type { Locale } from "contracts";
import type { PushSubscriptionStore, WebPushPort } from "../notifications/ports.js";

export interface DeliverPulsePromptInput {
  reservationRef: string;
  legId: string;
  locale: Locale;
}

export interface DeliverPulsePromptDeps {
  subscriptionStore: Pick<PushSubscriptionStore, "findActiveByReservation">;
  webPush: WebPushPort;
}

export interface DeliverPulsePromptResult {
  delivered: number;
}

/**
 * `experience-pulse`'s OWN independent push-delivery path (task 11.6):
 * invites every active push subscription on the reservation to open the
 * in-trip pulse prompt. Deliberately NOT `dispatchJourneyEvents` — this
 * function's dependency type has no `NotificationStore`/`AlertSourcePolicy`
 * field at all, so a pulse prompt structurally cannot touch the `notification`
 * table's `dedupe_key` mechanism or the `DELAY`/`RELOCATION`/`INCIDENT`
 * journey-event pipeline. One subscription's outcome never blocks another's
 * (same per-item isolation convention as `dispatchJourneyEvents`/
 * `runStaffAlertDispatchJob`).
 */
export async function deliverPulsePrompt(
  input: DeliverPulsePromptInput,
  deps: DeliverPulsePromptDeps,
): Promise<DeliverPulsePromptResult> {
  const subscriptions = await deps.subscriptionStore.findActiveByReservation(input.reservationRef);
  let delivered = 0;

  for (const subscription of subscriptions) {
    try {
      const outcome = await deps.webPush.send(subscription, {
        type: "PULSE_PROMPT",
        titleKey: "pulse.prompt.title",
        bodyKey: "pulse.prompt.body",
        url: "/trip/pulse",
        locale: input.locale,
      });
      if (outcome === "sent") delivered += 1;
    } catch {
      // Isolated per subscription: one failure never blocks another's delivery attempt.
    }
  }

  return { delivered };
}
