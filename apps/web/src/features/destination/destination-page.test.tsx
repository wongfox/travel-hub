import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ApiClient } from "../../shared/api/client.js";
import type { ContentResult, RichContent, TripDTO } from "contracts";
import { createI18n } from "../../i18n/index.js";
import { DestinationPage } from "./destination-page.js";

function buildFakeApiClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    get: vi.fn().mockRejectedValue(new Error("unexpected call")),
    post: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  };
}

function content(data: RichContent): ContentResult<RichContent> {
  return { data, locale: "en", fallbackLocale: false, fallbackTier: false, etag: "x" };
}

function renderPage(apiClient: ApiClient) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={createI18n({ initialLocale: "en" })}>
      <QueryClientProvider client={queryClient}>
        <DestinationPage apiClient={apiClient} />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe("DestinationPage", () => {
  it("renders the POI map, how-to-get-there guide, and circuit explanation once loaded", async () => {
    const trip = { legs: [], nextMilestone: null, features: {} } as unknown as TripDTO;
    const apiClient = buildFakeApiClient({
      get: vi.fn().mockImplementation((path: string) => {
        if (path === "/api/content/destination/poi_map") {
          return Promise.resolve(content({ title: "POI map", body: "MEDIA-POI-MAP" }));
        }
        if (path === "/api/content/destination/how_to_get_there") {
          return Promise.resolve(content({ title: "How to get there", body: "Walk to the bus stop." }));
        }
        if (path === "/api/content/destination/circuits") {
          return Promise.resolve(content({ title: "Circuits", body: "Check your entry ticket." }));
        }
        if (path === "/api/trip") return Promise.resolve(trip);
        return Promise.reject(new Error(`unexpected path ${path}`));
      }),
    });

    renderPage(apiClient);

    await waitFor(() => expect(screen.getByRole("img", { name: "POI map" })).toBeInTheDocument());
    expect(screen.getByRole("img")).toHaveAttribute("src", "/api/content/media/MEDIA-POI-MAP");
    expect(screen.getByText("Walk to the bus stop.")).toBeInTheDocument();
    expect(screen.getByText("Check your entry ticket.")).toBeInTheDocument();
  });

  it("acceptance: renders no live/real-time position data anywhere on the page", async () => {
    const trip = { legs: [], nextMilestone: null, features: {} } as unknown as TripDTO;
    const apiClient = buildFakeApiClient({
      get: vi.fn().mockImplementation((path: string) => {
        if (path === "/api/content/destination/poi_map") {
          return Promise.resolve(content({ title: "POI map", body: "MEDIA-POI-MAP" }));
        }
        if (path === "/api/content/destination/how_to_get_there") {
          return Promise.resolve(content({ title: "How to get there", body: "Walk to the bus stop." }));
        }
        if (path === "/api/content/destination/circuits") {
          return Promise.resolve(content({ title: "Circuits", body: "Check your entry ticket." }));
        }
        if (path === "/api/trip") return Promise.resolve(trip);
        return Promise.reject(new Error(`unexpected path ${path}`));
      }),
    });

    const { container } = renderPage(apiClient);

    await waitFor(() => expect(screen.getByRole("img")).toBeInTheDocument());
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(container.querySelectorAll("iframe")).toHaveLength(0);
    expect(container.querySelectorAll("canvas")).toHaveLength(0);
  });
});
