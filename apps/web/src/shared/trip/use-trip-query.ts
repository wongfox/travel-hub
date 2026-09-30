import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { TripDTO } from "contracts";
import type { ApiClient } from "../api/client.js";
import { getTrip } from "./get-trip.js";

/** Shared across every feature that renders from `GET /api/trip`, so visiting
 * two of them in the same session reuses one cached fetch. */
export const TRIP_QUERY_KEY = ["trip"] as const;

/**
 * TanStack Query hook (design Decision 1: "TanStack Query for online data")
 * backing `trip-home`, `trip-itinerary`, `travel-documents`, and
 * `service-tier-experience` — every capability that renders from the same
 * `GET /api/trip` payload (design Data Flow).
 */
export function useTripQuery(apiClient: ApiClient): UseQueryResult<TripDTO> {
  return useQuery({
    queryKey: TRIP_QUERY_KEY,
    queryFn: () => getTrip(apiClient),
  });
}
