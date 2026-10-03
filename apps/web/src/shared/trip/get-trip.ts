import type { TripDTO } from "contracts";
import type { ApiClient } from "../api/client.js";

/**
 * Fetches the trip overview (`GET /api/trip`) that `trip-home`,
 * `trip-itinerary`, `travel-documents`, and `service-tier-experience` all
 * render from (design Data Flow section). A thin wrapper — matching
 * `trip-access`'s `exchangeSession` convention — so callers can be tested
 * against an injected fake `ApiClient` instead of mocking `fetch`.
 */
export async function getTrip(apiClient: ApiClient): Promise<TripDTO> {
  return apiClient.get<TripDTO>("/api/trip");
}
