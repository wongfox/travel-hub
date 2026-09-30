import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../i18n/index.js";
import type { ApiClient } from "../../shared/api/client.js";
import { LinkLandingPage } from "./link-landing-page.js";

function buildFakeApiClient(post: ApiClient["post"]): ApiClient {
  return { get: vi.fn(), post, delete: vi.fn() };
}

function renderLandingPage(props: {
  apiClient: ApiClient;
  getHash: () => string;
  replaceState?: (path: string) => void;
  navigate?: (path: string) => void;
  locale?: "en" | "es" | "pt";
}) {
  return render(
    <I18nextProvider i18n={createI18n({ initialLocale: props.locale ?? "en" })}>
      <LinkLandingPage
        apiClient={props.apiClient}
        getHash={props.getHash}
        replaceState={props.replaceState ?? vi.fn()}
        navigate={props.navigate ?? vi.fn()}
      />
    </I18nextProvider>,
  );
}

describe("LinkLandingPage", () => {
  it("reads the token from the URL fragment and exchanges it for a session", async () => {
    const post = vi.fn().mockResolvedValue({ expiresAt: "2026-11-05T00:00:00.000Z" });
    const apiClient = buildFakeApiClient(post);

    renderLandingPage({ apiClient, getHash: () => "#a-real-token" });

    await vi.waitFor(() => {
      expect(post).toHaveBeenCalledWith("/api/session", { token: "a-real-token", locale: "en" });
    });
  });

  it("forwards the page's actual current locale, not a hardcoded default", async () => {
    const post = vi.fn().mockResolvedValue({ expiresAt: "2026-11-05T00:00:00.000Z" });
    const apiClient = buildFakeApiClient(post);

    renderLandingPage({ apiClient, getHash: () => "#a-real-token", locale: "pt" });

    await vi.waitFor(() => {
      expect(post).toHaveBeenCalledWith("/api/session", { token: "a-real-token", locale: "pt" });
    });
  });

  it("strips the fragment and navigates to trip home after a successful exchange", async () => {
    const post = vi.fn().mockResolvedValue({ expiresAt: "2026-11-05T00:00:00.000Z" });
    const apiClient = buildFakeApiClient(post);
    const replaceState = vi.fn();
    const navigate = vi.fn();

    renderLandingPage({ apiClient, getHash: () => "#a-real-token", replaceState, navigate });

    await vi.waitFor(() => {
      expect(replaceState).toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledWith("/trip");
    });
  });

  it("shows an invalid-link message with a re-request path when the fragment has no token", async () => {
    const post = vi.fn();
    const apiClient = buildFakeApiClient(post);

    renderLandingPage({ apiClient, getHash: () => "" });

    expect(await screen.findByRole("alert")).toHaveTextContent("This link is no longer valid.");
    expect(screen.getByRole("button", { name: "Send me a new link" })).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("shows an invalid-link message with a re-request path when the exchange call fails", async () => {
    const post = vi.fn().mockRejectedValue(new Error("simulated 401 link_expired"));
    const apiClient = buildFakeApiClient(post);
    const navigate = vi.fn();

    renderLandingPage({ apiClient, getHash: () => "#expired-token", navigate });

    expect(await screen.findByRole("alert")).toHaveTextContent("This link is no longer valid.");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("shows a loading state before the exchange settles", () => {
    const post = vi.fn(() => new Promise(() => {})); // never resolves
    const apiClient = buildFakeApiClient(post);

    renderLandingPage({ apiClient, getHash: () => "#a-real-token" });

    expect(screen.getByText("Opening your trip…")).toBeInTheDocument();
  });
});
