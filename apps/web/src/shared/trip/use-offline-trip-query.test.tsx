import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { ApiClient } from "../api/client.js";
import type { TripDTO } from "contracts";
import { useOfflineTripQuery } from "./use-offline-trip-query.js";
import { getTripSnapshot } from "../offline/trip-snapshot-store.js";
import { getActiveLinkId, setActiveLinkId } from "../offline/trip-prefs-store.js";

function buildFakeApiClient(get: ApiClient["get"]): ApiClient {
  return { get, post: vi.fn(), delete: vi.fn() };
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function buildTrip(linkId: string, reservationRefMasked: string): TripDTO {
  return {
    linkId,
    reservationRefMasked,
    expiresAt: "2026-10-05T00:00:00Z",
    passengers: [{ ordinal: 1, displayName: "A. Traveler", precheckinStatus: "none" }],
    legs: [
      {
        id: "leg-1",
        origin: "OLL",
        destination: "AGU",
        departureLocal: "2026-10-01T08:00:00",
        arrivalLocal: "2026-10-01T09:30:00",
        tier: "VOYAGER",
        status: "SCHEDULED",
      },
    ],
    boardingPasses: [],
    documents: [],
    alerts: [],
    nextMilestone: null,
    features: {
      precheckinCaptureUi: false,
      pushEnabled: false,
      pushA2hsPrompt: false,
      pulseCapture: false,
      wifiCheckout: false,
      menuEnabled: false,
      destinationEnabled: false,
      tierTheming: false,
      offlineContent: false,
    },
    fetchedAt: "2026-09-30T12:00:00Z",
  };
}

// `fake-indexeddb/auto` persists one `travelhub` database across every `it`
// block in this file, and the active-link-id `prefs` entry is a single
// global key. Each test below therefore uses its own distinct link id and
// explicitly (re)establishes the exact prefs state it needs — via a real
// online fetch, or directly via `setActiveLinkId` — instead of relying on
// execution order or a risky cross-test database reset.
describe("useOfflineTripQuery", () => {
  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it("refetches when the browser regains connectivity (spec 'Sync on reconnection')", async () => {
    const trip = buildTrip("offline-link-reconnect", "RES***03");
    const get = vi.fn().mockResolvedValue(trip);
    const apiClient = buildFakeApiClient(get);

    const { result } = renderHook(() => useOfflineTripQuery(apiClient), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("network"));
    expect(get).toHaveBeenCalledTimes(1);

    // TanStack Query's default `refetchOnReconnect` behavior (no extra
    // wiring in `useOfflineTripQuery` itself) refetches every mounted,
    // active query when the online manager transitions offline -> online.
    onlineManager.setOnline(false);
    onlineManager.setOnline(true);

    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });

  it("returns a network state and writes a snapshot + active link id when the fetch succeeds", async () => {
    const trip = buildTrip("offline-link-network", "RES***01");
    const get = vi.fn().mockResolvedValue(trip);
    const apiClient = buildFakeApiClient(get);

    const { result } = renderHook(() => useOfflineTripQuery(apiClient), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("network"));
    expect(result.current.status === "network" && result.current.trip).toEqual(trip);

    await waitFor(async () => expect(await getActiveLinkId()).toBe("offline-link-network"));
    const snapshot = await getTripSnapshot("offline-link-network");
    expect(snapshot?.reservationRefMasked).toBe("RES***01");
  });

  it("falls back to the cached snapshot when the live fetch fails and a snapshot exists", async () => {
    const trip = buildTrip("offline-link-cache", "RES***02");
    const get = vi.fn().mockResolvedValue(trip);
    const apiClient = buildFakeApiClient(get);
    const { result: onlineResult } = renderHook(() => useOfflineTripQuery(apiClient), { wrapper });
    await waitFor(() => expect(onlineResult.current.status).toBe("network"));
    await waitFor(async () => expect(await getActiveLinkId()).toBe("offline-link-cache"));

    const failingGet = vi.fn().mockRejectedValue(new Error("offline"));
    const offlineApiClient = buildFakeApiClient(failingGet);
    const { result } = renderHook(() => useOfflineTripQuery(offlineApiClient), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("cache"));
    expect(result.current.status === "cache" && result.current.snapshot.reservationRefMasked).toBe("RES***02");
  });

  it("reports unavailable when the fetch fails and the active link has no cached snapshot", async () => {
    await setActiveLinkId("offline-link-never-snapshotted");
    const failingGet = vi.fn().mockRejectedValue(new Error("offline"));
    const apiClient = buildFakeApiClient(failingGet);

    const { result } = renderHook(() => useOfflineTripQuery(apiClient), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("unavailable"));
  });
});
