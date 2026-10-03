import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TripDTO } from "contracts";
import { createI18n } from "../../i18n/index.js";
import type { ApiClient } from "../../shared/api/client.js";
import { setActiveLinkId } from "../../shared/offline/trip-prefs-store.js";
import { saveTripSnapshot } from "../../shared/offline/trip-snapshot-store.js";
import { toTripSnapshot } from "../../shared/offline/to-trip-snapshot.js";
import { ItineraryPage } from "./itinerary-page.js";

function buildFakeApiClient(get: ApiClient["get"]): ApiClient {
  return { get, post: vi.fn(), delete: vi.fn() };
}

function buildTrip(overrides: Partial<TripDTO> = {}): TripDTO {
  return {
    linkId: "link-1",
    reservationRefMasked: "RES***01",
    expiresAt: "2026-12-01T00:00:00.000Z",
    passengers: [],
    legs: [
      {
        id: "leg-1",
        origin: "Poroy",
        destination: "Machu Picchu",
        departureLocal: "2026-11-10T08:00:00",
        arrivalLocal: "2026-11-10T11:30:00",
        tier: "FIRST_CLASS",
        status: "SCHEDULED",
      },
    ],
    boardingPasses: [],
    documents: [],
    alerts: [],
    nextMilestone: { legId: "leg-1", kind: "departure", atLocal: "2026-11-10T08:00:00" },
    features: {} as TripDTO["features"],
    fetchedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

function renderPage(apiClient: ApiClient) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={createI18n({ initialLocale: "en" })}>
      <QueryClientProvider client={queryClient}>
        <ItineraryPage apiClient={apiClient} />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe("ItineraryPage", () => {
  it("shows a loading state before the fetch settles", () => {
    const apiClient = buildFakeApiClient(vi.fn(() => new Promise(() => {})));

    renderPage(apiClient);

    expect(screen.getByRole("status")).toHaveTextContent("Loading your trip…");
  });

  it("renders the itinerary timeline, tier-themed, on success", async () => {
    const apiClient = buildFakeApiClient(vi.fn().mockResolvedValue(buildTrip()));

    renderPage(apiClient);

    expect(await screen.findByTestId("itinerary-milestone")).toBeInTheDocument();
    expect(screen.getByTestId("theme-provider")).toBeInTheDocument();
    expect(screen.getByText("Itinerary")).toBeInTheDocument();
  });

  it("falls back to the cached itinerary with a freshness banner when the live fetch fails (task 7.1)", async () => {
    const trip = buildTrip({ linkId: "itinerary-cache-link" });
    await setActiveLinkId(trip.linkId);
    await saveTripSnapshot(trip.linkId, toTripSnapshot(trip));
    const apiClient = buildFakeApiClient(vi.fn().mockRejectedValue(new Error("offline")));

    renderPage(apiClient);

    expect(await screen.findByTestId("offline-itinerary-milestone")).toBeInTheDocument();
    expect(screen.getByTestId("theme-provider")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Last updated");
  });

  it("shows an error when the live fetch fails and no cached itinerary exists (task 7.1's isError branch)", async () => {
    await setActiveLinkId("itinerary-never-cached-link");
    const apiClient = buildFakeApiClient(vi.fn().mockRejectedValue(new Error("offline")));

    renderPage(apiClient);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("We couldn't load your trip"));
  });
});
