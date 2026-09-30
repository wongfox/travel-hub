import type { ConsentPurpose, ConsentState, RecordConsentRequest } from "contracts";
import type { ApiClient } from "../../../shared/api/client.js";

/**
 * Calls `POST /api/consents` (task 8.1) to record a purpose-specific
 * consent decision. A thin wrapper — same convention as `trip-access`'s
 * `exchangeSession`/`requestRelink` — so `PrecheckinConsentGate` is testable
 * against an injected fake `ApiClient` instead of mocking `fetch`.
 */
export async function submitConsent(
  apiClient: ApiClient,
  input: { purpose: ConsentPurpose; textVersion: string; granted: boolean },
): Promise<ConsentState> {
  return apiClient.post<ConsentState>("/api/consents", input satisfies RecordConsentRequest);
}
