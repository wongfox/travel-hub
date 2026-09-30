import type { Locale } from "contracts";
import { generateAccessToken, hashAccessToken } from "./token.js";
import { resolveAccessLinkByToken } from "./resolve-link.js";
import type { AccessLinkStore } from "./access-link-store.js";
import type { SessionStore } from "./session-store.js";

export type SessionExchangeErrorReason = "link_expired" | "link_revoked";

/**
 * Thrown by `exchangeAccessToken` when the token cannot resolve to a usable
 * session. `reason` maps directly onto the two distinguishable error
 * envelope codes the HTTP layer returns (task 5.3); an unknown/malformed
 * token is deliberately indistinguishable from an expired one (`link_expired`
 * for both) so no enumeration signal escapes beyond "this link cannot be used".
 */
export class SessionExchangeError extends Error {
  public readonly reason: SessionExchangeErrorReason;

  constructor(reason: SessionExchangeErrorReason) {
    super(`Session exchange rejected: ${reason}`);
    this.name = "SessionExchangeError";
    this.reason = reason;
  }
}

export interface ExchangeTokenDeps {
  accessLinkStore: AccessLinkStore;
  sessionStore: SessionStore;
  /** Sliding session lifetime cap in ms (design Decision 4: `min(sliding 7 days, link expiry)`). */
  sessionSlidingMs: number;
  /** Injectable clock for deterministic tests; defaults to `Date.now`. */
  now?: () => Date;
}

export interface ExchangeTokenResult {
  /** Raw session id — set as the `__Host-th_sess` cookie value by the HTTP layer; never persisted or logged in this form. */
  sessionId: string;
  linkId: string;
  expiresAt: string;
  locale: Locale;
}

const SOURCE_LOCALE: Locale = "es";

/**
 * `trip-link-access` session-exchange use case (task 5.3, design Decision
 * 4): resolves the raw token via the same hash-only lookup issuance uses,
 * rejects an unresolvable, revoked, or expired link without ever resolving
 * any trip data, and creates a fresh session capped at
 * `min(now + sessionSlidingMs, link.expiresAt)`.
 */
export async function exchangeAccessToken(
  token: string,
  requestedLocale: Locale | undefined,
  deps: ExchangeTokenDeps,
): Promise<ExchangeTokenResult> {
  const link = await resolveAccessLinkByToken(token, deps.accessLinkStore);
  const now = deps.now ? deps.now() : new Date();

  if (!link) {
    throw new SessionExchangeError("link_expired");
  }
  if (link.revokedAt) {
    throw new SessionExchangeError("link_revoked");
  }
  if (new Date(link.expiresAt).getTime() <= now.getTime()) {
    throw new SessionExchangeError("link_expired");
  }

  const sessionId = generateAccessToken();
  const sessionIdHash = hashAccessToken(sessionId);
  const slidingExpiresAt = now.getTime() + deps.sessionSlidingMs;
  const linkExpiresAt = new Date(link.expiresAt).getTime();
  const expiresAt = new Date(Math.min(slidingExpiresAt, linkExpiresAt)).toISOString();
  const locale = requestedLocale ?? SOURCE_LOCALE;

  await deps.sessionStore.create(sessionIdHash, {
    linkId: link.id,
    expiresAt,
    locale,
  });

  return { sessionId, linkId: link.id, expiresAt, locale };
}
