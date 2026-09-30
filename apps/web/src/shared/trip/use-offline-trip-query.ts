import { useEffect, useState } from "react";
import type { TripDTO } from "contracts";
import type { ApiClient } from "../api/client.js";
import { getActiveLinkId, setActiveLinkId } from "../offline/trip-prefs-store.js";
import { getTripSnapshot, saveTripSnapshot } from "../offline/trip-snapshot-store.js";
import { toTripSnapshot } from "../offline/to-trip-snapshot.js";
import type { TripSnapshot } from "../offline/trip-snapshot.js";
import { useTripQuery } from "./use-trip-query.js";

export type OfflineTripState =
  | { status: "loading" }
  | { status: "network"; trip: TripDTO }
  | { status: "cache"; snapshot: TripSnapshot }
  | { status: "unavailable" };

/**
 * `offline-trip-data` (task 7.1): wraps `useTripQuery` so `trip-itinerary`
 * and `travel-documents` stay viewable without connectivity after one
 * successful online load.
 *
 * - On a successful fetch, records the trip's link id as the device's
 *   "active" link (`trip-prefs-store.ts`, design Data Model "last opened is
 *   active") and writes a `TripSnapshot` (`trip-snapshot-store.ts`).
 *   Persistence failures (e.g. IndexedDB unavailable in private browsing)
 *   are swallowed — never breaking the online render over an offline-store
 *   write that failed.
 * - On a failed fetch (offline, expired session, etc.), reads back the
 *   active link's snapshot and renders from cache instead of surfacing an
 *   error, when one exists.
 * - Reconnection is handled by `useTripQuery`'s underlying `useQuery`
 *   itself: TanStack Query's default `refetchOnReconnect` behavior refetches
 *   any mounted, active query when the browser's `online` event fires, with
 *   no extra wiring needed here (spec "Sync on reconnection").
 */
export function useOfflineTripQuery(apiClient: ApiClient): OfflineTripState {
  const query = useTripQuery(apiClient);
  const [cache, setCache] = useState<{ checked: boolean; snapshot: TripSnapshot | undefined }>({
    checked: false,
    snapshot: undefined,
  });

  useEffect(() => {
    if (!query.isSuccess) {
      return;
    }
    const trip = query.data;
    void (async () => {
      try {
        await setActiveLinkId(trip.linkId);
        await saveTripSnapshot(trip.linkId, toTripSnapshot(trip));
      } catch {
        // Offline-store write failures never block the online render.
      }
    })();
  }, [query.isSuccess, query.data]);

  useEffect(() => {
    // No "reset" branch for the non-error case: `cache` is only ever read
    // from the `query.isError` render branch below, and every fresh
    // transition into an error re-runs this effect (the dependency array
    // watches the boolean itself), which re-derives `cache` from scratch —
    // a stale value from a previous error is never visible in between.
    if (!query.isError) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const linkId = await getActiveLinkId().catch(() => undefined);
      const snapshot = linkId ? await getTripSnapshot(linkId).catch(() => undefined) : undefined;
      if (!cancelled) {
        setCache({ checked: true, snapshot });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query.isError]);

  if (query.isSuccess) {
    return { status: "network", trip: query.data };
  }

  if (query.isError) {
    if (!cache.checked) {
      return { status: "loading" };
    }
    return cache.snapshot ? { status: "cache", snapshot: cache.snapshot } : { status: "unavailable" };
  }

  return { status: "loading" };
}
