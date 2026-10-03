import { describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TripDTO } from "contracts";
import { createI18n } from "../../i18n/index.js";
import type { ApiClient } from "../../shared/api/client.js";
import { TripHomePage } from "./trip-home-page.js";

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
        tier: "PRIME",
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
        <TripHomePage apiClient={apiClient} />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe("TripHomePage", () => {
  it("shows a loading state before the fetch settles", () => {
    const apiClient = buildFakeApiClient(vi.fn(() => new Promise(() => {})));

    renderPage(apiClient);

    expect(screen.getByRole("status")).toHaveTextContent("Loading your trip…");
  });

  it("shows an error state when the fetch fails", async () => {
    const apiClient = buildFakeApiClient(vi.fn().mockRejectedValue(new Error("simulated 401")));

    renderPage(apiClient);

    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't load your trip");
  });

  it("renders the trip status, next milestone, and tier-themed content on success", async () => {
    const apiClient = buildFakeApiClient(vi.fn().mockResolvedValue(buildTrip()));

    renderPage(apiClient);

    expect(await screen.findByTestId("trip-status")).toHaveTextContent("Upcoming trip");
    expect(screen.getByTestId("theme-provider")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Itinerary" })).toHaveAttribute("href", "/trip/itinerary");
    expect(screen.getByRole("link", { name: "Documents" })).toHaveAttribute("href", "/trip/documents");
  });

  it("links to pre check-in only when the capture flag is on and a consent version is published", async () => {
    const on = buildFakeApiClient(
      vi.fn().mockResolvedValue(
        buildTrip({
          features: { precheckinCaptureUi: true } as TripDTO["features"],
          consentTextVersions: { precheckin: "pc-v1" },
        }),
      ),
    );
    renderPage(on);
    expect(await screen.findByRole("link", { name: "Pre check-in" })).toHaveAttribute("href", "/trip/precheckin");
    cleanup();

    const off = buildFakeApiClient(
      vi.fn().mockResolvedValue(
        buildTrip({
          features: { precheckinCaptureUi: false } as TripDTO["features"],
          consentTextVersions: { precheckin: "pc-v1" },
        }),
      ),
    );
    renderPage(off);
    await screen.findByTestId("trip-status");
    expect(screen.queryByRole("link", { name: "Pre check-in" })).not.toBeInTheDocument();
  });

  it("renders relocation alerts alongside the status", async () => {
    const trip = buildTrip({
      alerts: [
        {
          id: "relocation:leg-1:2026-11-01T00:00:00.000Z",
          type: "RELOCATION",
          legId: "leg-1",
          titleKey: "alerts.relocation.title",
          bodyKey: "alerts.relocation.body",
          occurredAt: "2026-11-01T00:00:00.000Z",
        },
      ],
    });
    const apiClient = buildFakeApiClient(vi.fn().mockResolvedValue(trip));

    renderPage(apiClient);

    expect(await screen.findByRole("alert")).toHaveTextContent("You've been relocated");
  });
});
