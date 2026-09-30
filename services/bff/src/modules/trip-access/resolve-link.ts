import { hashAccessToken } from "./token.js";
import type { AccessLinkRecord, AccessLinkStore } from "./access-link-store.js";

/**
 * Resolves a raw token to its stored `access_link` record by hashing it and
 * looking up the hash — the raw token itself is never persisted or
 * compared directly (design Decision 4). This is a narrow resolution
 * primitive only; the full session-exchange endpoint (expiry/revocation
 * enforcement, rate limiting, cookie issuance) is `trip-link-access`'s
 * session-exchange scope (task 5.3), not issuance (task 5.2).
 */
export async function resolveAccessLinkByToken(
  token: string,
  store: AccessLinkStore,
): Promise<AccessLinkRecord | null> {
  return store.findByTokenHash(hashAccessToken(token));
}
