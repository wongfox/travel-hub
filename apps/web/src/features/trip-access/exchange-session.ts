import type { Locale } from "contracts";
import type { ApiClient } from "../../shared/api/client.js";

export interface SessionExchangeResponse {
  expiresAt: string;
}

/**
 * Calls `POST /api/session` (task 5.3) to exchange a raw access-link token
 * for an `__Host-th_sess` session cookie. A thin wrapper (rather than
 * inlining this call in the component) so `LinkLandingPage` can be tested
 * against an injected fake `ApiClient` instead of mocking `fetch`.
 *
 * `locale` must be the caller's current UI language (e.g. `i18n.language`,
 * per `ReissueForm`'s existing pattern) — without it, the BFF falls back to
 * its `"es"` source-locale default regardless of the passenger's actual
 * language, silently mis-localizing the session it returns.
 */
export async function exchangeSession(
  apiClient: ApiClient,
  token: string,
  locale: Locale,
): Promise<SessionExchangeResponse> {
  return apiClient.post<SessionExchangeResponse>("/api/session", { token, locale });
}
