import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../i18n/index.js";
import type { ApiClient } from "../../shared/api/client.js";
import { PrecheckinCaptureFlow } from "./precheckin-capture-flow.js";

afterEach(() => {
  cleanup();
});

function buildFakeApiClient(post: ApiClient["post"]): ApiClient {
  return { get: vi.fn(), post, delete: vi.fn() };
}

describe("PrecheckinCaptureFlow (consent gate + capture step, task 8.1/8.2 integration)", () => {
  it("never requests the camera before consent is recorded", () => {
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [] });
    const post = vi.fn().mockResolvedValue({
      purpose: "precheckin_biometric",
      granted: true,
      textVersion: "v1",
      recordedAt: "2026-09-30T12:00:00.000Z",
    });
    render(
      <I18nextProvider i18n={createI18n({ initialLocale: "en" })}>
        <PrecheckinCaptureFlow
          role="photo"
          apiClient={buildFakeApiClient(post)}
          consentTextVersion="v1"
          onAccepted={vi.fn()}
          mediaDevices={{ getUserMedia }}
        />
      </I18nextProvider>,
    );

    expect(screen.getByText("Pre check-in: photo & ID consent")).toBeInTheDocument();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("requests the camera and renders the capture UI only after consent is granted", async () => {
    const user = userEvent.setup();
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [] });
    const post = vi.fn().mockResolvedValue({
      purpose: "precheckin_biometric",
      granted: true,
      textVersion: "v1",
      recordedAt: "2026-09-30T12:00:00.000Z",
    });
    render(
      <I18nextProvider i18n={createI18n({ initialLocale: "en" })}>
        <PrecheckinCaptureFlow
          role="photo"
          apiClient={buildFakeApiClient(post)}
          consentTextVersion="v1"
          onAccepted={vi.fn()}
          mediaDevices={{ getUserMedia }}
        />
      </I18nextProvider>,
    );

    await user.click(screen.getByRole("button", { name: "I agree" }));

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: "user" } }));
    expect(await screen.findByTestId("camera-capture-photo")).toBeInTheDocument();
  });

  it("never requests the camera at all when consent is declined", async () => {
    const user = userEvent.setup();
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [] });
    const post = vi.fn().mockResolvedValue({
      purpose: "precheckin_biometric",
      granted: false,
      textVersion: "v1",
      recordedAt: "2026-09-30T12:00:00.000Z",
    });
    render(
      <I18nextProvider i18n={createI18n({ initialLocale: "en" })}>
        <PrecheckinCaptureFlow
          role="photo"
          apiClient={buildFakeApiClient(post)}
          consentTextVersion="v1"
          onAccepted={vi.fn()}
          mediaDevices={{ getUserMedia }}
        />
      </I18nextProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Not now" }));

    expect(await screen.findByText(/complete pre check-in later/)).toBeInTheDocument();
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});
