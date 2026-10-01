import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../i18n/index.js";
import type { ApiClient } from "../../shared/api/client.js";
import { PushOptIn } from "./push-opt-in.js";

function renderWithI18n(ui: React.ReactElement) {
  const i18n = createI18n({ initialLocale: "en" });
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

function buildApiClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return { get: vi.fn(), post: vi.fn(), delete: vi.fn(), ...overrides };
}

describe("PushOptIn", () => {
  it("renders nothing at all when the browser is ineligible (task 11.3 acceptance: an ineligible-browser fixture shows no push opt-in option)", () => {
    const { container } = renderWithI18n(
      <PushOptIn
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
    const post = vi.fn().mockResolvedValue({ id: "sub-1", expiresAt: "2026-11-05T00:00:00.000Z" });
    const subscribeToBrowserPush = vi.fn().mockResolvedValue({
      endpoint: "https://push.example.com/endpoint-1",
      keys: { p256dh: "p1", auth: "a1" },
    });
    renderWithI18n(
      <PushOptIn
        apiClient={buildApiClient({ post })}
        a2hsPromptEnabled={true}
        locale="en"
        env={{ hasPushManager: true, isIosDevice: false, isStandalone: false }}
        subscribeToBrowserPush={subscribeToBrowserPush}
      />,
    );

    await userEvent.click(screen.getByRole("button"));

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
        apiClient={buildApiClient()}
        a2hsPromptEnabled={true}
        locale="en"
        env={{ hasPushManager: true, isIosDevice: false, isStandalone: false }}
        subscribeToBrowserPush={subscribeToBrowserPush}
      />,
    );

    await userEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });
});
