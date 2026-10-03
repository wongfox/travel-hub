import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../i18n/index.js";
import type { ApiClient } from "../api/client.js";
import { PurposeConsentGate } from "./purpose-consent-gate.js";

function buildFakeApiClient(post: ApiClient["post"]): ApiClient {
  return { get: vi.fn(), post, delete: vi.fn() };
}

function grantedResponse(purpose: string, granted: boolean) {
  return { purpose, granted, textVersion: "v1", recordedAt: "2026-09-30T12:00:00.000Z" };
}

function renderGate(
  post: ApiClient["post"],
  props: { cacheScope?: string; children?: React.ComponentProps<typeof PurposeConsentGate>["children"] } = {},
) {
  render(
    <I18nextProvider i18n={createI18n({ initialLocale: "en" })}>
      <PurposeConsentGate
        apiClient={buildFakeApiClient(post)}
        purpose="push"
        textVersion="v1"
        i18nPrefix="consent.push"
        {...(props.cacheScope ? { cacheScope: props.cacheScope } : {})}
      >
        {props.children ?? <div data-testid="gated">gated ui</div>}
      </PurposeConsentGate>
    </I18nextProvider>,
  );
}

describe("PurposeConsentGate", () => {
  beforeEach(() => window.localStorage.clear());

  it("shows the purpose's consent copy and never renders children before consent is recorded", () => {
    renderGate(vi.fn());

    expect(screen.getByRole("heading", { name: "Trip notifications" })).toBeInTheDocument();
    expect(screen.queryByTestId("gated")).not.toBeInTheDocument();
  });

  it("records a granted consent for the given purpose and text version, then renders children", async () => {
    const post = vi.fn().mockResolvedValue(grantedResponse("push", true));
    renderGate(post);

    await userEvent.click(screen.getByRole("button", { name: "I agree" }));

    expect(await screen.findByTestId("gated")).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith("/api/consents", { purpose: "push", textVersion: "v1", granted: true });
  });

  it("shows a non-error declined message without children or any retry control when declined", async () => {
    const post = vi.fn().mockResolvedValue(grantedResponse("push", false));
    renderGate(post);

    await userEvent.click(screen.getByRole("button", { name: "Not now" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/notifications are off/i);
    expect(screen.queryByTestId("gated")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(post).toHaveBeenCalledWith("/api/consents", { purpose: "push", textVersion: "v1", granted: false });
  });

  it("stays on the consent screen with an error when recording fails", async () => {
    renderGate(vi.fn().mockRejectedValue(new Error("network")));

    await userEvent.click(screen.getByRole("button", { name: "I agree" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByTestId("gated")).not.toBeInTheDocument();
  });

  it("skips the screen and the request when a matching grant is cached for the scope", () => {
    window.localStorage.setItem("th-consent:link-1:push", "v1");
    const post = vi.fn();
    renderGate(post, { cacheScope: "link-1" });

    expect(screen.getByTestId("gated")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("asks again when the cached grant is for an older text version", () => {
    window.localStorage.setItem("th-consent:link-1:push", "v0");
    renderGate(vi.fn(), { cacheScope: "link-1" });

    expect(screen.queryByTestId("gated")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "I agree" })).toBeInTheDocument();
  });

  it("caches a granted consent only when a cache scope is given", async () => {
    const post = vi.fn().mockResolvedValue(grantedResponse("push", true));
    renderGate(post, { cacheScope: "link-1" });

    await userEvent.click(screen.getByRole("button", { name: "I agree" }));
    await screen.findByTestId("gated");

    expect(window.localStorage.getItem("th-consent:link-1:push")).toBe("v1");
  });

  it("does not cache anything without a cache scope", async () => {
    const post = vi.fn().mockResolvedValue(grantedResponse("push", true));
    renderGate(post);

    await userEvent.click(screen.getByRole("button", { name: "I agree" }));
    await screen.findByTestId("gated");

    expect(window.localStorage.length).toBe(0);
  });

  it("does not cache a declined consent", async () => {
    const post = vi.fn().mockResolvedValue(grantedResponse("push", false));
    renderGate(post, { cacheScope: "link-1" });

    await userEvent.click(screen.getByRole("button", { name: "Not now" }));
    await screen.findByRole("status");

    expect(window.localStorage.length).toBe(0);
  });

  it("hands the recorded consent's recordId to function children", async () => {
    const post = vi.fn().mockResolvedValue({ ...grantedResponse("push", true), recordId: "consent-42" });
    renderGate(post, {
      children: ({ consentRecordId }) => <p data-testid="record-id">{consentRecordId}</p>,
    });

    await userEvent.click(screen.getByRole("button", { name: "I agree" }));

    expect(await screen.findByTestId("record-id")).toHaveTextContent("consent-42");
  });

  it("re-shows the consent screen and forgets the cache when children report consent_required", async () => {
    window.localStorage.setItem("th-consent:link-1:push", "v1");
    renderGate(vi.fn(), {
      cacheScope: "link-1",
      children: ({ onConsentRequired }) => (
        <button type="button" onClick={onConsentRequired}>
          simulate 403
        </button>
      ),
    });

    await userEvent.click(screen.getByRole("button", { name: "simulate 403" }));

    expect(screen.getByRole("button", { name: "I agree" })).toBeInTheDocument();
    expect(window.localStorage.getItem("th-consent:link-1:push")).toBeNull();
  });
});
