import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../i18n/index.js";
import { ApiError, type ApiClient } from "../../shared/api/client.js";
import { PushOptIn } from "./push-opt-in.js";

function renderWithI18n(ui: React.ReactElement) {
  const i18n = createI18n({ initialLocale: "en" });
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

function buildApiClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return { get: vi.fn(), post: vi.fn(), delete: vi.fn(), ...overrides };
}

const eligibleEnv = { hasPushManager: true, isIosDevice: false, isStandalone: false };
const goodBrowserSubscription = {
  endpoint: "https://push.example.com/endpoint-1",
  keys: { p256dh: "p1", auth: "a1" },
};

/** Routes `POST /api/consents` and `POST /api/push/subscriptions` independently. */
function buildRoutedPost(subscriptionResult: () => Promise<unknown>) {
  return vi.fn(async (path: string) => {
    if (path === "/api/consents") {
      return { purpose: "push", granted: true, textVersion: "push-v1", recordedAt: "2026-10-01T00:00:00.000Z" };
    }
    return subscriptionResult();
  });
}

describe("PushOptIn", () => {
  beforeEach(() => window.localStorage.clear());

  it("renders nothing at all when the browser is ineligible (task 11.3 acceptance: an ineligible-browser fixture shows no push opt-in option)", () => {
    const { container } = renderWithI18n(
      <PushOptIn
        consentTextVersion="push-v1"
        cacheScope="link-1"
        apiClient={buildApiClient()}
        a2hsPromptEnabled={true}
        locale="en"
        env={{ hasPushManager: false, isIosDevice: false, isStandalone: false }}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when a2hs is needed but the push.a2hs_prompt flag is off", () => {
    const { container } = renderWithI18n(
      <PushOptIn
        consentTextVersion="push-v1"
        cacheScope="link-1"
        apiClient={buildApiClient()}
        a2hsPromptEnabled={false}
        locale="en"
        env={{ hasPushManager: true, isIosDevice: true, isStandalone: false }}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders the add-to-home-screen explainer (no permission button) when a2hs is needed and the flag is on", () => {
    renderWithI18n(
      <PushOptIn
        consentTextVersion="push-v1"
        cacheScope="link-1"
        apiClient={buildApiClient()}
        a2hsPromptEnabled={true}
        locale="en"
        env={{ hasPushManager: true, isIosDevice: true, isStandalone: false }}
      />,
    );

    expect(screen.getByTestId("push-a2hs-explainer")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders an opt-in button when eligible, and subscribes on click", async () => {
    const post = buildRoutedPost(async () => ({ id: "sub-1", expiresAt: "2026-11-05T00:00:00.000Z" }));
    const subscribeToBrowserPush = vi.fn().mockResolvedValue({
      endpoint: "https://push.example.com/endpoint-1",
      keys: { p256dh: "p1", auth: "a1" },
    });
    renderWithI18n(
      <PushOptIn
        consentTextVersion="push-v1"
        cacheScope="link-1"
        apiClient={buildApiClient({ post })}
        a2hsPromptEnabled={true}
        locale="en"
        env={{ hasPushManager: true, isIosDevice: false, isStandalone: false }}
        subscribeToBrowserPush={subscribeToBrowserPush}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "I agree" }));
    await userEvent.click(await screen.findByRole("button", { name: "Enable notifications" }));

    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(subscribeToBrowserPush).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("/api/push/subscriptions", {
      endpoint: "https://push.example.com/endpoint-1",
      keys: { p256dh: "p1", auth: "a1" },
      locale: "en",
    });
  });

  it("shows an error message and never crashes when the browser subscription attempt fails", async () => {
    const subscribeToBrowserPush = vi.fn().mockRejectedValue(new Error("permission denied"));
    renderWithI18n(
      <PushOptIn
        consentTextVersion="push-v1"
        cacheScope="link-1"
        apiClient={buildApiClient({ post: buildRoutedPost(async () => ({})) })}
        a2hsPromptEnabled={true}
        locale="en"
        env={{ hasPushManager: true, isIosDevice: false, isStandalone: false }}
        subscribeToBrowserPush={subscribeToBrowserPush}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "I agree" }));
    await userEvent.click(await screen.findByRole("button", { name: "Enable notifications" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });
  it("shows the consent screen first and never touches the browser permission before consent", () => {
    const subscribeToBrowserPush = vi.fn();
    renderWithI18n(
      <PushOptIn
        consentTextVersion="push-v1"
        cacheScope="link-1"
        apiClient={buildApiClient()}
        a2hsPromptEnabled={true}
        locale="en"
        env={eligibleEnv}
        subscribeToBrowserPush={subscribeToBrowserPush}
      />,
    );

    expect(screen.getByRole("button", { name: "I agree" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enable notifications" })).not.toBeInTheDocument();
    expect(subscribeToBrowserPush).not.toHaveBeenCalled();
  });

  it("records push consent with the BFF-provided version before the browser prompt", async () => {
    const post = buildRoutedPost(async () => ({ id: "sub-1", expiresAt: "2026-11-05T00:00:00.000Z" }));
    const subscribeToBrowserPush = vi.fn().mockImplementation(async () => {
      expect(post).toHaveBeenCalledWith("/api/consents", {
        purpose: "push",
        textVersion: "push-v1",
        granted: true,
      });
      return goodBrowserSubscription;
    });
    renderWithI18n(
      <PushOptIn
        consentTextVersion="push-v1"
        cacheScope="link-1"
        apiClient={buildApiClient({ post })}
        a2hsPromptEnabled={true}
        locale="en"
        env={eligibleEnv}
        subscribeToBrowserPush={subscribeToBrowserPush}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "I agree" }));
    await userEvent.click(await screen.findByRole("button", { name: "Enable notifications" }));

    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(subscribeToBrowserPush).toHaveBeenCalledTimes(1);
  });

  it("goes straight to the enable button when a matching consent is cached", () => {
    window.localStorage.setItem("th-consent:link-1:push", "push-v1");
    renderWithI18n(
      <PushOptIn
        consentTextVersion="push-v1"
        cacheScope="link-1"
        apiClient={buildApiClient()}
        a2hsPromptEnabled={true}
        locale="en"
        env={eligibleEnv}
      />,
    );

    expect(screen.getByRole("button", { name: "Enable notifications" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "I agree" })).not.toBeInTheDocument();
  });

  it("re-shows the consent screen, not the generic error, when the BFF answers 403 consent_required", async () => {
    window.localStorage.setItem("th-consent:link-1:push", "push-v1");
    const post = vi.fn().mockRejectedValue(new ApiError("consent_required", "req-1", 403));
    renderWithI18n(
      <PushOptIn
        consentTextVersion="push-v1"
        cacheScope="link-1"
        apiClient={buildApiClient({ post })}
        a2hsPromptEnabled={true}
        locale="en"
        env={eligibleEnv}
        subscribeToBrowserPush={vi.fn().mockResolvedValue(goodBrowserSubscription)}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Enable notifications" }));

    expect(await screen.findByRole("button", { name: "I agree" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("th-consent:link-1:push")).toBeNull();
  });

  it("shows a calm declined message and no enable button when consent is declined", async () => {
    const post = vi.fn().mockResolvedValue({
      purpose: "push",
      granted: false,
      textVersion: "push-v1",
      recordedAt: "2026-10-01T00:00:00.000Z",
    });
    const subscribeToBrowserPush = vi.fn();
    renderWithI18n(
      <PushOptIn
        consentTextVersion="push-v1"
        cacheScope="link-1"
        apiClient={buildApiClient({ post })}
        a2hsPromptEnabled={true}
        locale="en"
        env={eligibleEnv}
        subscribeToBrowserPush={subscribeToBrowserPush}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Not now" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/notifications are off/i);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(subscribeToBrowserPush).not.toHaveBeenCalled();
  });
});
