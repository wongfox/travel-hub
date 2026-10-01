import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ApiClient } from "../../shared/api/client.js";
import type { ContentResult, MenuSection, TripDTO } from "contracts";
import { createI18n } from "../../i18n/index.js";
import { MenuPage } from "./menu-page.js";

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
        <MenuPage apiClient={apiClient} />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe("MenuPage", () => {
  it("renders menu content once loaded", async () => {
    const menu: ContentResult<MenuSection[]> = {
      data: [{ id: "s1", title: "Snacks", items: [{ id: "i1", name: "Cookie" }] }],
      locale: "en",
      fallbackLocale: false,
      fallbackTier: false,
      etag: "x",
    };
    const trip = { legs: [], nextMilestone: null } as unknown as TripDTO;
    const apiClient = buildFakeApiClient({
      get: vi.fn().mockImplementation((path: string) => {
        if (path === "/api/content/menu") return Promise.resolve(menu);
        if (path === "/api/trip") return Promise.resolve(trip);
        return Promise.reject(new Error(`unexpected path ${path}`));
      }),
    });

    renderPage(apiClient);

    await waitFor(() => expect(screen.getByText("Cookie")).toBeInTheDocument());
    expect(screen.getByText("Snacks")).toBeInTheDocument();
  });

  it("acceptance: renders no purchase/order control anywhere on the page", async () => {
    const menu: ContentResult<MenuSection[]> = {
      data: [{ id: "s1", title: "Snacks", items: [{ id: "i1", name: "Cookie" }] }],
      locale: "en",
      fallbackLocale: false,
      fallbackTier: false,
      etag: "x",
    };
    const trip = { legs: [], nextMilestone: null } as unknown as TripDTO;
    const apiClient = buildFakeApiClient({
      get: vi.fn().mockImplementation((path: string) => {
        if (path === "/api/content/menu") return Promise.resolve(menu);
        if (path === "/api/trip") return Promise.resolve(trip);
        return Promise.reject(new Error(`unexpected path ${path}`));
      }),
    });

    renderPage(apiClient);

    await waitFor(() => expect(screen.getByText("Cookie")).toBeInTheDocument());
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
