import type { Locale } from "contracts";
import { assertConsentGranted } from "../privacy/consent-guard.js";
import type { ConsentStore } from "../privacy/consent-store.js";
import type { PushSubscriptionRecord, PushSubscriptionStore } from "./ports.js";

export interface SubscribePushDeps {
  consentStore: Pick<ConsentStore, "findLatest">;
  subscriptionStore: Pick<PushSubscriptionStore, "create">;
}

export interface SubscribePushInput {
  linkId: string;
  reservationRef: string;
  passengerScope: string[];
  endpoint: string;
  p256dh: string;
  auth: string;
  locale: Locale;
  /** `= access_link.expires_at` (design Decision 11), resolved by the HTTP layer from the caller's active session. */
  expiresAt: string;
}

/**
 * `push-notifications` subscription lifecycle (task 11.1, design Decision
 * 11): rejects with `ConsentRequiredError` (reusing task 8.1's shared guard,
 * same convention as pre check-in's `submitPrecheckin`) when no granted
 * `push` consent is on file for this reservation — never creates a
 * subscription in that case (spec "no subscription is created without a
 * recorded push consent"). `expiresAt` always mirrors the link's own expiry,
 * so the subscription naturally expires with the trip.
 */
export async function subscribePush(
  input: SubscribePushInput,
  deps: SubscribePushDeps,
): Promise<PushSubscriptionRecord> {
  const consent = await assertConsentGranted(deps, input.reservationRef, null, "push");

  return deps.subscriptionStore.create({
    linkId: input.linkId,
    reservationRef: input.reservationRef,
    passengerScope: input.passengerScope,
    endpoint: input.endpoint,
    p256dh: input.p256dh,
    auth: input.auth,
    locale: input.locale,
    consentRecordId: consent.id,
    expiresAt: input.expiresAt,
  });
}
