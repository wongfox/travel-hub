import type { Locale } from "contracts";
import { hashAccessToken } from "./token.js";
import type { AccessLinkRecord, AccessLinkStore } from "./access-link-store.js";
import type { SessionStore } from "./session-store.js";

export interface ResolveSessionDeps {
  sessionStore: SessionStore;
  accessLinkStore: AccessLinkStore;
  /** Injectable clock for deterministic tests; defaults to `Date.now`. */
  now?: () => Date;
}

export interface ResolvedSession {
  accessLink: AccessLinkRecord;
  locale: Locale;
}

/**
 * Resolves the raw `__Host-th_sess` cookie value (design Decision 4) to its
 * still-valid access link, for any capability route that needs to know "who
 * is this session for" beyond `trip-access`'s own bootstrap/forget-device
 * routes (task 5.3). Used by `trip`'s `GET /api/trip` (task 6.2) and future
 * capability routes that read scoped SIR data.
 *
 * Every failure path (missing cookie, unknown session, expired session, or a
 * session whose underlying link was since revoked) returns `null`
 * uniformly — deliberately indistinguishable, consistent with
 * `trip-link-access`'s no-enumeration design already applied to session
 * exchange itself.
 */
export async function resolveActiveSession(
  rawCookieValue: string | undefined,
  deps: ResolveSessionDeps,
): Promise<ResolvedSession | null> {
  if (!rawCookieValue) {
    return null;
  }

  const now = deps.now ? deps.now() : new Date();
  const session = await deps.sessionStore.findByIdHash(hashAccessToken(rawCookieValue));
  if (!session) {
    return null;
  }
  if (new Date(session.expiresAt).getTime() <= now.getTime()) {
    return null;
  }

  const accessLink = await deps.accessLinkStore.findById(session.linkId);
  if (!accessLink || accessLink.revokedAt) {
    return null;
  }

  return { accessLink, locale: session.locale };
}
