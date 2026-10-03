import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TripDTO } from "contracts";
import type { ApiClient } from "../../shared/api/client.js";
import { createI18n } from "../../i18n/index.js";
import { PushPage } from "./push-page.js";

function buildFakeApiClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    get: vi.fn().mockRejectedValue(new Error("unexpected call")),
    post: vi.fn().mockRejectedValue(new Error("unexpected call")),
    delete: vi.fn(),
    ...overrides,
  };
}

function buildTrip(features: Partial<TripDTO["features"]>, consentTextVersions?: TripDTO["consentTextVersions"]): TripDTO {
  return {
    linkId: "link-1",
    ...(consentTextVersions ? { consentTextVersions } : {}),
    legs: [],
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
      ...features,
    },
  } as unknown as TripDTO;
}

function renderPage(apiClient: ApiClient, env?: { hasPushManager: boolean; isIosDevice: boolean; isStandalone: boolean }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={createI18n({ initialLocale: "en" })}>
      <QueryClientProvider client={queryClient}>
        <PushPage apiClient={apiClient} {...(env ? { env } : {})} />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe("PushPage", () => {
  it("shows an unavailable message when trip.features.pushEnabled is false", async () => {
    const apiClient = buildFakeApiClient({
      get: vi.fn().mockResolvedValue(buildTrip({ pushEnabled: false })),
    });

    renderPage(apiClient, { hasPushManager: true, isIosDevice: false, isStandalone: false });

    await waitFor(() => expect(screen.getByText(/not available/i)).toBeInTheDocument());
  });

  it("renders the opt-in UI when trip.features.pushEnabled is true and the browser is eligible", async () => {
    const apiClient = buildFakeApiClient({
      get: vi.fn().mockResolvedValue(buildTrip({ pushEnabled: true }, { push: "push-v1" })),
    });

    renderPage(apiClient, { hasPushManager: true, isIosDevice: false, isStandalone: false });

    await waitFor(() => expect(screen.getByRole("button", { name: "I agree" })).toBeInTheDocument());
  });

  it("shows the unavailable message, not an invented consent, when the BFF exposes no push consent version", async () => {
    const apiClient = buildFakeApiClient({
      get: vi.fn().mockResolvedValue(buildTrip({ pushEnabled: true })),
    });

    renderPage(apiClient, { hasPushManager: true, isIosDevice: false, isStandalone: false });

    await waitFor(() => expect(screen.getByText(/not available/i)).toBeInTheDocument());
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows no opt-in option at all when the browser is ineligible, even if pushEnabled is true", async () => {
    const apiClient = buildFakeApiClient({
      get: vi.fn().mockResolvedValue(buildTrip({ pushEnabled: true }, { push: "push-v1" })),
    });

    renderPage(apiClient, { hasPushManager: false, isIosDevice: false, isStandalone: false });

    await waitFor(() => expect(screen.getByText("Notifications")).toBeInTheDocument());
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
