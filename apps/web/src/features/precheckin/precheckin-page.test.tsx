import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TripDTO } from "contracts";
import type { ApiClient } from "../../shared/api/client.js";
import { createI18n } from "../../i18n/index.js";
import { PrecheckinPage } from "./precheckin-page.js";

afterEach(() => cleanup());
beforeEach(() => window.localStorage.clear());

type Passenger = { ordinal: number; displayName: string; precheckinStatus: "none" | "received" | "unavailable" };

function buildTrip(opts: { enabled: boolean; version?: string; passengers: Passenger[] }): TripDTO {
  return {
    linkId: "link-1",
    passengers: opts.passengers,
    legs: [],
    nextMilestone: null,
    ...(opts.version ? { consentTextVersions: { precheckin: opts.version } } : {}),
    features: { precheckinCaptureUi: opts.enabled } as unknown as TripDTO["features"],
  } as unknown as TripDTO;
}

function buildApiClient(trip: TripDTO, post: ApiClient["post"] = vi.fn()): ApiClient {
  return { get: vi.fn().mockResolvedValue(trip), post, delete: vi.fn() };
}

function renderPage(apiClient: ApiClient) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={createI18n({ initialLocale: "en" })}>
      <QueryClientProvider client={queryClient}>
        <PrecheckinPage apiClient={apiClient} mediaDevices={{}} />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

const ONE: Passenger[] = [{ ordinal: 1, displayName: "Ana Quispe", precheckinStatus: "none" }];
const TWO: Passenger[] = [
  { ordinal: 1, displayName: "Ana Quispe", precheckinStatus: "received" },
  { ordinal: 2, displayName: "Luis Quispe", precheckinStatus: "none" },
];

describe("PrecheckinPage", () => {
  it("shows an unavailable message and no controls when precheckinCaptureUi is off", async () => {
    renderPage(buildApiClient(buildTrip({ enabled: false, version: "pc-v1", passengers: ONE })));

    expect(await screen.findByText(/not available right now/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the unavailable message, never an invented consent, when the BFF publishes no precheckin consent version", async () => {
    renderPage(buildApiClient(buildTrip({ enabled: true, passengers: ONE })));

    expect(await screen.findByText(/not available right now/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("goes straight to the consent gate for a single-passenger reservation, and never calls the camera before consent", async () => {
    const getUserMedia = vi.fn();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <I18nextProvider i18n={createI18n({ initialLocale: "en" })}>
        <QueryClientProvider client={queryClient}>
          <PrecheckinPage
            apiClient={buildApiClient(buildTrip({ enabled: true, version: "pc-v1", passengers: ONE }))}
            mediaDevices={{ getUserMedia }}
          />
        </QueryClientProvider>
      </I18nextProvider>,
    );

    expect(await screen.findByRole("button", { name: "I agree" })).toBeInTheDocument();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("lists passengers with their status when the reservation has several, offering capture only for pending ones", async () => {
    renderPage(buildApiClient(buildTrip({ enabled: true, version: "pc-v1", passengers: TWO })));

    expect(await screen.findByText("Ana Quispe")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start pre check-in for Luis Quispe" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /for Ana Quispe/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "I agree" })).not.toBeInTheDocument();
  });

  it("records consent with the published version, never caches it, and submits for the chosen passenger ordinal", async () => {
    const user = userEvent.setup();
    const post = vi.fn(async (path: string) => {
      if (path === "/api/consents") {
        return { purpose: "precheckin_biometric", granted: true, textVersion: "pc-v1", recordedAt: "now", recordId: "consent-9" };
      }
      return { passengerOrdinal: 2, status: "received" };
    });
    renderPage(buildApiClient(buildTrip({ enabled: true, version: "pc-v1", passengers: TWO }), post as ApiClient["post"]));

    await user.click(await screen.findByRole("button", { name: "Start pre check-in for Luis Quispe" }));
    await user.click(screen.getByRole("button", { name: "I agree" }));
    expect(post).toHaveBeenCalledWith("/api/consents", {
      purpose: "precheckin_biometric",
      textVersion: "pc-v1",
      granted: true,
    });
    expect(window.localStorage.length).toBe(0);

    await user.upload(await screen.findByTestId("precheckin-file-fallback-photo"), new File(["p"], "p.jpg", { type: "image/jpeg" }));
    await user.upload(await screen.findByTestId("precheckin-file-fallback-id_front"), new File(["i"], "i.jpg", { type: "image/jpeg" }));
    await user.selectOptions(await screen.findByLabelText("Document type"), "DNI");
    await user.click(screen.getByRole("button", { name: "Send pre check-in" }));

    expect(await screen.findByText(/pre check-in received/i)).toBeInTheDocument();
    const submitCall = post.mock.calls.find(([path]) => path === "/api/precheckin/2")!;
    expect((submitCall[1] as unknown as FormData).get("consentRecordId")).toBe("consent-9");
    await waitFor(() => expect(window.localStorage.length).toBe(0));
  });

  it("shows only the completion status, no capture, for a passenger who already completed pre check-in", async () => {
    renderPage(
      buildApiClient(
        buildTrip({ enabled: true, version: "pc-v1", passengers: [{ ordinal: 1, displayName: "Ana Quispe", precheckinStatus: "received" }] }),
      ),
    );

    expect(await screen.findByText("Completed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "I agree" })).not.toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });
});
