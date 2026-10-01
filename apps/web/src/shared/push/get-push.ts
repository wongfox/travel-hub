import type { PushSubscriptionRequest } from "contracts";
import type { ApiClient } from "../api/client.js";

export interface CreatePushSubscriptionResult {
  id: string;
  expiresAt: string;
}

/**
 * Thin fetch wrapper for `push-notifications`'s subscription lifecycle
 * (task 11.3), matching `shared/wifi/get-wifi.ts`'s convention: one function
 * per endpoint, so the opt-in UI is testable against an injected fake
 * `ApiClient` instead of mocking `fetch`.
 */
export async function createPushSubscription(
  apiClient: ApiClient,
  body: PushSubscriptionRequest,
): Promise<CreatePushSubscriptionResult> {
  return apiClient.post<CreatePushSubscriptionResult>("/api/push/subscriptions", body);
}

export async function deletePushSubscription(apiClient: ApiClient, id: string): Promise<void> {
  await apiClient.delete<void>(`/api/push/subscriptions/${id}`);
}
