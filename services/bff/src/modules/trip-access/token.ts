import { createHash, randomBytes } from "node:crypto";

/**
 * Access-link token per design Decision 4: 32 random bytes, base64url
 * encoded for safe inclusion in a URL fragment. Only this raw value is ever
 * delivered to the passenger; only its hash (`hashAccessToken`) is stored,
 * so the raw token never appears server-side beyond the exchange call.
 */
export function generateAccessToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * SHA-256 hex digest of a raw token, the only representation persisted in
 * `access_link.token_hash` (design Decision 4) — irreversible, so a
 * database read alone can never recover a usable token.
 */
export function hashAccessToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
