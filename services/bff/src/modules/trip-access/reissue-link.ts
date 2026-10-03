import type { Locale } from "contracts";
import type { SirBookingPort } from "../booking/ports.js";
import type { PushSubscriptionStore } from "../notifications/ports.js";
import type { AccessLinkStore } from "./access-link-store.js";
import type { LinkDeliveryPort } from "./ports.js";
import { issueAccessLink } from "./issue-link.js";

export interface ReissueLinkDeps {
  sirBooking: Pick<SirBookingPort, "getContactForLinkDelivery">;
  store: AccessLinkStore;
  linkDelivery: LinkDeliveryPort;
  linkExpiryMs: number;
  buildLinkUrl: (token: string) => string;
  /**
   * Task 11.1's reissue-invalidation acceptance ("reissuing a link
   * invalidates the prior subscription and requires a fresh opt-in"):
   * optional so every caller that predates `push-notifications` keeps
   * working unchanged. When provided, every push subscription bound to a
   * link this call revokes is deleted in the same pass.
   */
  pushSubscriptionStore?: Pick<PushSubscriptionStore, "deleteByLinkId">;
  /** Injectable clock for deterministic tests; defaults to `Date.now`. */
  now?: () => Date;
}

export interface ReissueLinkInput {
  reservationRef: string;
  surname: string;
  locale: Locale;
}

/**
 * `trip-link-access` "Link re-request" use case (task 5.4, design Decision
 * 4). Always resolves without throwing regardless of whether the inputs
 * matched a reservation — the HTTP layer returns an identical `202`
 * response either way, so this function's return type (`void`, never a
 * discriminated match/no-match result) is itself part of the
 * no-enumeration guarantee. On a match, issues (and delivers) a fresh link
 * exactly like `POST /internal/links`, then supersedes every older
 * still-active link of the same reservation (`superseded_by` = the newest),
 * so the previous link stops working immediately (spec "Re-issued link
 * invalidates the previous one").
 */
export async function reissueAccessLink(input: ReissueLinkInput, deps: ReissueLinkDeps): Promise<void> {
  const contact = await deps.sirBooking.getContactForLinkDelivery(
    { reservationRef: input.reservationRef },
    { surname: input.surname },
  );
  if (!contact) {
    return;
  }

  await issueAccessLink(
    { reservationRef: input.reservationRef, contact, locale: input.locale },
    {
      store: deps.store,
      linkDelivery: deps.linkDelivery,
      linkExpiryMs: deps.linkExpiryMs,
      buildLinkUrl: deps.buildLinkUrl,
      ...(deps.now ? { now: deps.now } : {}),
    },
  );

  // Only after the new link was delivered (a failing delivery must not kill the link that still works).
  // One atomic step that keeps the newest active link and revokes every other one, so racing reissues
  // (several api instances) converge to exactly one active link; each revoked link is returned to one caller.
  const revoked = await deps.store.supersedeOlderActive(input.reservationRef);
  await Promise.all(revoked.map((link) => deps.pushSubscriptionStore?.deleteByLinkId(link.id)));
}
