import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TripDTO } from "contracts";
import { createI18n } from "../../i18n/index.js";
import { ApiError, type ApiClient } from "../../shared/api/client.js";
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
    consentTextVersions: { pulse: "pulse-v1" },
    fetchedAt: "2026-11-02T10:00:00.000Z",
    ...overrides,
  };
}

const PULSE_CONSENT_CACHE_KEY = "th-consent:link-1:pulse";

function consentResponse(granted: boolean) {
  return { purpose: "pulse", granted, textVersion: "pulse-v1", recordedAt: "2026-11-02T10:00:00.000Z" };
}

/** Routes `POST /api/consents` apart from the pulse routes (all other posts answer `received`). */
function routedPost(consentGranted = true) {
  return vi.fn(async (path: string) => (path === "/api/consents" ? consentResponse(consentGranted) : { status: "received" }));
}

function buildApiClient(trip: TripDTO, overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    get: vi.fn().mockResolvedValue(trip),
    post: routedPost(),
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

  it("shows the consent screen first and neither renders the prompt nor requests a push prompt before consent", async () => {
    const apiClient = buildApiClient(buildTrip());
    renderWithProviders(<PulsePage apiClient={apiClient} />);

    expect(await screen.findByRole("button", { name: "I agree" })).toBeInTheDocument();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it("records pulse consent with the BFF-provided version, then shows the prompt and requests the push prompt", async () => {
    const apiClient = buildApiClient(buildTrip());
    renderWithProviders(<PulsePage apiClient={apiClient} />);

    await userEvent.click(await screen.findByRole("button", { name: "I agree" }));

    expect(await screen.findByRole("group")).toBeInTheDocument();
    expect(apiClient.post).toHaveBeenCalledWith("/api/consents", {
      purpose: "pulse",
      textVersion: "pulse-v1",
      granted: true,
    });
    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith("/api/pulse/prompt", { legId: "L1" });
    });
    const paths = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0]);
    expect(paths.indexOf("/api/consents")).toBeLessThan(paths.indexOf("/api/pulse/prompt"));
    expect(window.localStorage.getItem(PULSE_CONSENT_CACHE_KEY)).toBe("pulse-v1");
  });

  it("stays unavailable with a calm message and sends nothing when consent is declined", async () => {
    const apiClient = buildApiClient(buildTrip(), { post: routedPost(false) });
    renderWithProviders(<PulsePage apiClient={apiClient} />);

    await userEvent.click(await screen.findByRole("button", { name: "Not now" }));

    expect(await screen.findByText(/we will not ask you about this trip/i)).toBeInTheDocument();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalledWith("/api/pulse/prompt", expect.anything());
  });

  it("shows the unavailable message when the BFF exposes no pulse consent version", async () => {
    const { consentTextVersions: _omit, ...withoutVersions } = buildTrip();
    void _omit;
    const apiClient = buildApiClient(withoutVersions);
    renderWithProviders(<PulsePage apiClient={apiClient} />);

    expect(await screen.findByText("This survey is not available right now.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "I agree" })).not.toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it("re-shows the consent screen, not an error, when submitting the answer gets 403 consent_required", async () => {
    window.localStorage.setItem(PULSE_CONSENT_CACHE_KEY, "pulse-v1");
    const post = vi.fn(async (path: string) => {
      if (path === "/api/pulse") throw new ApiError("consent_required", "req-1", 403);
      return { status: "received" };
    });
    renderWithProviders(<PulsePage apiClient={buildApiClient(buildTrip(), { post })} />);

    await screen.findByRole("group");
    await userEvent.click(screen.getByTestId("pulse-face-5"));

    expect(await screen.findByRole("button", { name: "I agree" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(window.localStorage.getItem(PULSE_CONSENT_CACHE_KEY)).toBeNull();
  });

  it("renders the faces-scale prompt and requests a push prompt once, when a leg has reached the trigger moment (task 11.6: delivered in-app always, additionally via push)", async () => {
    window.localStorage.setItem(PULSE_CONSENT_CACHE_KEY, "pulse-v1");
    const trip = buildTrip();
    const apiClient = buildApiClient(trip);
    renderWithProviders(<PulsePage apiClient={apiClient} />);

    await screen.findByRole("group");

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith("/api/pulse/prompt", { legId: "L1" });
    });
  });

  it("submits the selected score and switches to the thank-you state", async () => {
    window.localStorage.setItem(PULSE_CONSENT_CACHE_KEY, "pulse-v1");
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
