import type { Locale } from "contracts";
import type { SirBookingPort } from "../booking/ports.js";
import type { AccessLinkStore } from "./access-link-store.js";
import type { LinkDeliveryPort } from "./ports.js";
import { issueAccessLink } from "./issue-link.js";

export interface ReissueLinkDeps {
  sirBooking: Pick<SirBookingPort, "getContactForLinkDelivery">;
  store: AccessLinkStore;
  linkDelivery: LinkDeliveryPort;
  linkExpiryMs: number;
  buildLinkUrl: (token: string) => string;
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
 * exactly like `POST /internal/links`, then revokes every other
 * still-active link for the same reservation (`superseded_by`), so the
 * previous link stops working immediately (spec "Re-issued link
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

  const previouslyActive = await deps.store.findActiveByReservation(input.reservationRef);

  const { accessLinkId } = await issueAccessLink(
    { reservationRef: input.reservationRef, contact, locale: input.locale },
    {
      store: deps.store,
      linkDelivery: deps.linkDelivery,
      linkExpiryMs: deps.linkExpiryMs,
      buildLinkUrl: deps.buildLinkUrl,
      ...(deps.now ? { now: deps.now } : {}),
    },
  );

  await Promise.all(previouslyActive.map((link) => deps.store.revoke(link.id, accessLinkId)));
}
