import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TripDTO } from "contracts";
import { createI18n } from "../../i18n/index.js";
import type { ApiClient } from "../../shared/api/client.js";
import { PulsePage } from "./pulse-page.js";

function renderWithProviders(ui: React.ReactElement) {
  const i18n = createI18n({ initialLocale: "en" });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>
    </QueryClientProvider>,
  );
}

function buildTrip(overrides: Partial<TripDTO> = {}): TripDTO {
  return {
    linkId: "link-1",
    reservationRefMasked: "RES-***1",
    expiresAt: "2099-01-01T00:00:00.000Z",
    passengers: [],
    legs: [
      {
        id: "L1",
        origin: "Ollantaytambo",
        destination: "Machu Picchu Pueblo",
        departureLocal: "2026-11-02T08:10:00-05:00",
        arrivalLocal: "2026-11-02T09:40:00-05:00",
        tier: "PRIME",
        status: "COMPLETED",
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
      pulseCapture: true,
      wifiCheckout: false,
      menuEnabled: false,
      destinationEnabled: false,
      tierTheming: false,
      offlineContent: false,
    },
    fetchedAt: "2026-11-02T10:00:00.000Z",
    ...overrides,
  };
}

function buildApiClient(trip: TripDTO, overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    get: vi.fn().mockResolvedValue(trip),
    post: vi.fn().mockResolvedValue({ status: "received" }),
    delete: vi.fn(),
    ...overrides,
  };
}

describe("PulsePage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it("shows an unavailable message when pulse.capture is off", async () => {
    const trip = buildTrip({ features: { ...buildTrip().features, pulseCapture: false } });
    renderWithProviders(<PulsePage apiClient={buildApiClient(trip)} />);

    expect(await screen.findByText("This survey is not available right now.")).toBeInTheDocument();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  it("shows a no-trigger message and never requests a push prompt when no leg has reached the trigger moment", async () => {
    const trip = buildTrip({ legs: [{ ...buildTrip().legs[0]!, status: "SCHEDULED" }] });
    const apiClient = buildApiClient(trip);
    renderWithProviders(<PulsePage apiClient={apiClient} />);

    expect(await screen.findByText(/nothing to answer yet/i)).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it("renders the faces-scale prompt and requests a push prompt once, when a leg has reached the trigger moment (task 11.6: delivered in-app always, additionally via push)", async () => {
    const trip = buildTrip();
    const apiClient = buildApiClient(trip);
    renderWithProviders(<PulsePage apiClient={apiClient} />);

    await screen.findByRole("group");

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith("/api/pulse/prompt", { legId: "L1" });
    });
  });

  it("submits the selected score and switches to the thank-you state", async () => {
    const trip = buildTrip();
    const apiClient = buildApiClient(trip);
    renderWithProviders(<PulsePage apiClient={apiClient} />);

    await screen.findByRole("group");
    await userEvent.click(screen.getByTestId("pulse-face-5"));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith("/api/pulse", { legId: "L1", score: 5 });
    });
    expect(await screen.findByText("Thanks for your feedback!")).toBeInTheDocument();
  });

  it("shows the thank-you state and skips the prompt entirely when already answered locally", async () => {
    window.localStorage.setItem("pulse-answered:link-1:L1", "true");
    const trip = buildTrip();
    const apiClient = buildApiClient(trip);
    renderWithProviders(<PulsePage apiClient={apiClient} />);

    expect(await screen.findByText("Thanks for your feedback!")).toBeInTheDocument();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(apiClient.post).not.toHaveBeenCalled();
    });
  });
});
