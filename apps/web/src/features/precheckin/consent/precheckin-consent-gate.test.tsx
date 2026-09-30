import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../../i18n/index.js";
import type { ApiClient } from "../../../shared/api/client.js";
import { PrecheckinConsentGate } from "./precheckin-consent-gate.js";

function buildFakeApiClient(post: ApiClient["post"]): ApiClient {
  return { get: vi.fn(), post, delete: vi.fn() };
}

function renderGate(post: ApiClient["post"]) {
  const apiClient = buildFakeApiClient(post);
  render(
    <I18nextProvider i18n={createI18n({ initialLocale: "en" })}>
      <PrecheckinConsentGate apiClient={apiClient} consentTextVersion="v1">
        <div data-testid="capture-ui">capture ui rendered</div>
      </PrecheckinConsentGate>
    </I18nextProvider>,
  );
}

describe("PrecheckinConsentGate", () => {
  it("never renders its children (the capture UI) before consent is recorded", () => {
    renderGate(vi.fn());

    expect(screen.queryByTestId("capture-ui")).not.toBeInTheDocument();
    expect(screen.getByText("Pre check-in: photo & ID consent")).toBeInTheDocument();
  });

  it("renders the children only after the accept button successfully records consent", async () => {
    const user = userEvent.setup();
    const post = vi.fn().mockResolvedValue({
      purpose: "precheckin_biometric",
      granted: true,
      textVersion: "v1",
      recordedAt: "2026-09-30T12:00:00.000Z",
    });
    renderGate(post);

    await user.click(screen.getByRole("button", { name: "I agree" }));

    expect(await screen.findByTestId("capture-ui")).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith("/api/consents", {
      purpose: "precheckin_biometric",
      textVersion: "v1",
      granted: true,
    });
  });

  it("shows a declined message and never renders the capture UI when the passenger declines", async () => {
    const user = userEvent.setup();
    const post = vi.fn().mockResolvedValue({
      purpose: "precheckin_biometric",
      granted: false,
      textVersion: "v1",
      recordedAt: "2026-09-30T12:00:00.000Z",
    });
    renderGate(post);

    await user.click(screen.getByRole("button", { name: "Not now" }));

    expect(await screen.findByText(/complete pre check-in later/)).toBeInTheDocument();
    expect(screen.queryByTestId("capture-ui")).not.toBeInTheDocument();
    expect(post).toHaveBeenCalledWith("/api/consents", {
      purpose: "precheckin_biometric",
      textVersion: "v1",
      granted: false,
    });
  });

  it("shows an error and stays on the consent screen when recording consent fails", async () => {
    const user = userEvent.setup();
    const post = vi.fn().mockRejectedValue(new Error("network error"));
    renderGate(post);

    await user.click(screen.getByRole("button", { name: "I agree" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByTestId("capture-ui")).not.toBeInTheDocument();
  });
});
