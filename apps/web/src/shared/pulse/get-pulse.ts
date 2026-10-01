import type { SubmitPulseRequest } from "contracts";
import type { ApiClient } from "../api/client.js";

/**
 * Thin fetch wrappers for `experience-pulse`'s routes (tasks 11.4, 11.6),
 * matching `shared/wifi/get-wifi.ts`'s convention: one function per endpoint.
 */
export async function submitPulseResponse(apiClient: ApiClient, body: SubmitPulseRequest): Promise<{ status: string }> {
  return apiClient.post<{ status: string }>("/api/pulse", body);
}

/**
 * Requests best-effort push delivery of the in-trip pulse prompt (task
 * 11.6) — its own independent delivery path, never routed through the
 * `push-notifications` journey-events pipeline.
 */
export async function requestPulsePrompt(apiClient: ApiClient, legId: string): Promise<{ status: string }> {
  return apiClient.post<{ status: string }>("/api/pulse/prompt", { legId });
}
