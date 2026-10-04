import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ApiClient } from "../../shared/api/client.js";
import type { ContentResult, FaqEntry, TripDTO } from "contracts";
import { createI18n } from "../../i18n/index.js";
import { HelpPage } from "./help-page.js";

function buildFakeApiClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    get: vi.fn().mockRejectedValue(new Error("unexpected call")),
    post: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  };
}

function renderPage(apiClient: ApiClient) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={createI18n({ initialLocale: "en" })}>
      <QueryClientProvider client={queryClient}>
        <HelpPage apiClient={apiClient} />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe("HelpPage", () => {
  it("renders FAQ content and the WhatsApp button once loaded", async () => {
    const faq: ContentResult<FaqEntry[]> = {
      data: [{ id: "f1", question: "Q1", answer: "A1" }],
      locale: "en",
      fallbackLocale: false,
      fallbackTier: false,
      etag: "x",
    };
    const trip = { legs: [], nextMilestone: null, features: {} } as unknown as TripDTO;
    const apiClient = buildFakeApiClient({
      get: vi.fn().mockImplementation((path: string) => {
        if (path === "/api/content/faq") return Promise.resolve(faq);
        if (path === "/api/trip") return Promise.resolve(trip);
        return Promise.reject(new Error(`unexpected path ${path}`));
      }),
    });

    renderPage(apiClient);

    await waitFor(() => expect(screen.getByText("Q1")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /whatsapp/i })).toBeInTheDocument();
  });

  it("acceptance: never renders a chat, chatbot, or ticket-submission control", async () => {
    const faq: ContentResult<FaqEntry[]> = {
      data: [{ id: "f1", question: "Q1", answer: "A1" }],
      locale: "en",
      fallbackLocale: false,
      fallbackTier: false,
      etag: "x",
    };
    const trip = { legs: [], nextMilestone: null, features: {} } as unknown as TripDTO;
    const apiClient = buildFakeApiClient({
      get: vi.fn().mockImplementation((path: string) => {
        if (path === "/api/content/faq") return Promise.resolve(faq);
        if (path === "/api/trip") return Promise.resolve(trip);
        return Promise.reject(new Error(`unexpected path ${path}`));
      }),
    });

    renderPage(apiClient);

    await waitFor(() => expect(screen.getByText("Q1")).toBeInTheDocument());
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    // No chatbot/ticket-submission escalation path — the WhatsApp deep link
    // ("Chat with us on WhatsApp") is the one and only contact mechanism.
    expect(screen.queryByText(/chatbot/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ticket/i)).not.toBeInTheDocument();
  });
});
