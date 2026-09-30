import type { ApiClient } from "../../shared/api/client.js";

export interface SessionExchangeResponse {
  expiresAt: string;
}

/**
 * Calls `POST /api/session` (task 5.3) to exchange a raw access-link token
 * for an `__Host-th_sess` session cookie. A thin wrapper (rather than
 * inlining this call in the component) so `LinkLandingPage` can be tested
 * against an injected fake `ApiClient` instead of mocking `fetch`.
 */
export async function exchangeSession(
  apiClient: ApiClient,
  token: string,
): Promise<SessionExchangeResponse> {
  return apiClient.post<SessionExchangeResponse>("/api/session", { token });
}
