import type { AlertSourcePolicy } from "contracts";
import { DuplicateNotificationError } from "./ports.js";
import type { JourneyEvent, NotificationStore, PushSubscriptionStore, WebPushPort } from "./ports.js";

export interface DispatchJourneyEventsDeps {
  notificationStore: NotificationStore;
  subscriptionStore: Pick<PushSubscriptionStore, "findActiveByReservation" | "deleteById">;
  webPush: WebPushPort;
  alertSourcePolicy: AlertSourcePolicy;
}

export interface DispatchJourneyEventsResult {
  processed: number;
  pushed: number;
  skippedByPolicy: number;
  skippedDuplicate: number;
}

function buildDedupeKey(event: JourneyEvent): string {
  return `${event.type}:${event.reservationRef}:${event.sourceEventId}`;
}

async function dispatchOne(event: JourneyEvent, deps: DispatchJourneyEventsDeps): Promise<"pushed" | "skippedByPolicy" | "skippedDuplicate"> {
  const dedupeKey = buildDedupeKey(event);
  const policyEntry = deps.alertSourcePolicy[event.type];
  const pushIsOfficial = policyEntry?.pushIsOfficialSource ?? false;

  if (!pushIsOfficial) {
    try {
      await deps.notificationStore.create({
        reservationRef: event.reservationRef,
        alertType: event.type,
        sourceEventId: event.sourceEventId,
        channel: "banner",
        dedupeKey,
        status: "skipped_policy",
      });
    } catch (error) {
      if (error instanceof DuplicateNotificationError) return "skippedDuplicate";
      throw error;
    }
    return "skippedByPolicy";
  }

  let created;
  try {
    created = await deps.notificationStore.create({
      reservationRef: event.reservationRef,
      alertType: event.type,
      sourceEventId: event.sourceEventId,
      channel: "push",
      dedupeKey,
      status: "pending",
    });
  } catch (error) {
    if (error instanceof DuplicateNotificationError) return "skippedDuplicate";
    throw error;
  }

  const subscriptions = await deps.subscriptionStore.findActiveByReservation(event.reservationRef);
  let anySent = false;
  for (const subscription of subscriptions) {
    const outcome = await deps.webPush.send(subscription, {
      type: event.type,
      titleKey: `alerts.${event.type.toLowerCase()}.title`,
      bodyKey: `alerts.${event.type.toLowerCase()}.body`,
      url: "/trip",
      locale: subscription.locale,
    });
    if (outcome === "sent") anySent = true;
    if (outcome === "gone") {
      await deps.subscriptionStore.deleteById(subscription.id);
    }
  }

  await deps.notificationStore.updateStatus(
    created.id,
    anySent ? "sent" : "failed",
    anySent ? new Date().toISOString() : undefined,
  );
  return "pushed";
}

/**
 * `push-notifications` delivery pipeline (task 11.2, design Decision 11):
 * for every polled `JourneyEvent`, decides push-vs-banner via
 * `AlertSourcePolicy`, enforces the `dedupe_key` unique constraint through
 * `NotificationStore.create` (never silently overwrites or double-sends),
 * and fans out to every active push subscription for the reservation when
 * push is the official source. One event's outcome never blocks another's
 * (same "one failure never blocks another" convention as
 * `runHandoffJob`/`runWifiEntitlementActivationJob`). The in-app banner
 * itself (`TripDTO.alerts[]`, `build-relocation-alerts.ts`) is unaffected by
 * this pipeline — it is driven directly from relocation data and already
 * renders unconditionally, per the baseline-channel requirement.
 */
export async function dispatchJourneyEvents(
  events: JourneyEvent[],
  deps: DispatchJourneyEventsDeps,
): Promise<DispatchJourneyEventsResult> {
  let pushed = 0;
  let skippedByPolicy = 0;
  let skippedDuplicate = 0;

  for (const event of events) {
    const outcome = await dispatchOne(event, deps);
    if (outcome === "pushed") pushed += 1;
    else if (outcome === "skippedByPolicy") skippedByPolicy += 1;
    else skippedDuplicate += 1;
  }

  return { processed: events.length, pushed, skippedByPolicy, skippedDuplicate };
}
