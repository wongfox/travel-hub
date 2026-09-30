import type { Locale } from "contracts";
import { generateAccessToken, hashAccessToken } from "./token.js";
import type { AccessLinkStore } from "./access-link-store.js";
import type { ContactChannel, LinkDeliveryPort } from "./ports.js";

export interface IssueLinkDeps {
  store: AccessLinkStore;
  linkDelivery: LinkDeliveryPort;
  /** Link validity window in milliseconds (design Decision 4: last leg arrival + grace, configurable). */
  linkExpiryMs: number;
  buildLinkUrl: (token: string) => string;
  /** Injectable clock for deterministic tests; defaults to `Date.now`. */
  now?: () => Date;
}

export interface IssueLinkInput {
  reservationRef: string;
  /** Passenger refs this link is scoped to; omit/empty for "all passengers on the reservation". */
  passengerScope?: string[];
  contact: ContactChannel;
  locale: Locale;
}

export interface IssueLinkResult {
  accessLinkId: string;
  expiresAt: string;
}

/**
 * `trip-link-access` "Personalized link issuance" use case (design Decision
 * 4, task 5.2): generates a fresh opaque token, persists only its hash
 * scoped to exactly one reservation (+ optional passenger scope), and
 * delivers the link through `LinkDeliveryPort` — the raw token is handed to
 * the delivery port and to the caller's link URL only, never stored.
 */
export async function issueAccessLink(
  input: IssueLinkInput,
  deps: IssueLinkDeps,
): Promise<IssueLinkResult> {
  const token = generateAccessToken();
  const tokenHash = hashAccessToken(token);
  const now = deps.now ? deps.now() : new Date();
  const expiresAt = new Date(now.getTime() + deps.linkExpiryMs).toISOString();

  const record = await deps.store.create({
    tokenHash,
    reservationRef: input.reservationRef,
    passengerScope: input.passengerScope ?? [],
    expiresAt,
    issueChannel: input.contact.kind,
  });

  const linkUrl = deps.buildLinkUrl(token);
  await deps.linkDelivery.deliver(input.contact, linkUrl, input.locale);

  return { accessLinkId: record.id, expiresAt: record.expiresAt };
}
