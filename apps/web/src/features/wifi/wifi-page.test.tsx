import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ApiClient } from "../../shared/api/client.js";
import { ApiError } from "../../shared/api/client.js";
import type { TripDTO, WifiOrderDTO, WifiPackageDTO } from "contracts";
import { createI18n } from "../../i18n/index.js";
import { WifiPage } from "./wifi-page.js";
import { rememberWifiOrderId } from "../../shared/wifi/wifi-order-session.js";

function buildFakeApiClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    get: vi.fn().mockRejectedValue(new Error("unexpected call")),
    post: vi.fn().mockRejectedValue(new Error("unexpected call")),
    delete: vi.fn(),
    ...overrides,
  };
}

const TRIP = { legs: [], nextMilestone: null } as unknown as TripDTO;

const PACKAGES: WifiPackageDTO[] = [
  { id: "WIFI-60", code: "wifi-60", name: "WiFi 60 min", priceMinor: 1500, currency: "PEN", durationMinutes: 60 },
];

function renderPage(
  apiClient: ApiClient,
  options: { getSearch?: () => string; redirectTo?: (url: string) => void; generateIdempotencyKey?: () => string } = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={createI18n({ initialLocale: "en" })}>
      <QueryClientProvider client={queryClient}>
        <WifiPage apiClient={apiClient} {...options} />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe("WifiPage — catalog mode", () => {
  it("renders the package catalog once loaded", async () => {
    const apiClient = buildFakeApiClient({
      get: vi.fn().mockImplementation((path: string) => {
        if (path === "/api/wifi/packages") return Promise.resolve(PACKAGES);
        if (path === "/api/trip") return Promise.resolve(TRIP);
        return Promise.reject(new Error(`unexpected path ${path}`));
      }),
    });

    renderPage(apiClient, { getSearch: () => "" });

    await waitFor(() => expect(screen.getByText("WiFi 60 min")).toBeInTheDocument());
  });

  it("shows an unavailable message (not a generic error) when wifi.checkout is off (403 feature_disabled) — acceptance", async () => {
    const apiClient = buildFakeApiClient({
      get: vi.fn().mockImplementation((path: string) => {
        if (path === "/api/wifi/packages") {
          return Promise.reject(new ApiError("feature_disabled", "req-1", 403));
        }
        if (path === "/api/trip") return Promise.resolve(TRIP);
        return Promise.reject(new Error(`unexpected path ${path}`));
      }),
    });

    renderPage(apiClient, { getSearch: () => "" });

    await waitFor(() => expect(screen.getByText(/not available/i)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /buy/i })).not.toBeInTheDocument();
  });

  it("creates an order and redirects the browser to the gateway's redirectUrl when a package is bought", async () => {
    const order: WifiOrderDTO = {
      id: "order-1",
      packageId: "WIFI-60",
      status: "PAYMENT_PENDING",
      amountMinor: 1500,
      currency: "PEN",
      sirRegistered: false,
      receiptIssued: false,
      entitlementRef: null,
      entitlementExpiresAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const post = vi.fn().mockResolvedValue({ order, redirectUrl: "https://stub-gateway.local/pay/1" });
    const redirectTo = vi.fn();
    const apiClient = buildFakeApiClient({
      get: vi.fn().mockImplementation((path: string) => {
        if (path === "/api/wifi/packages") return Promise.resolve(PACKAGES);
        if (path === "/api/trip") return Promise.resolve(TRIP);
        return Promise.reject(new Error(`unexpected path ${path}`));
      }),
      post,
    });

    renderPage(apiClient, { getSearch: () => "", redirectTo, generateIdempotencyKey: () => "idem-fixed" });
    await waitFor(() => expect(screen.getByText("WiFi 60 min")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /buy/i }));

    await waitFor(() => expect(redirectTo).toHaveBeenCalledWith("https://stub-gateway.local/pay/1"));
    expect(post).toHaveBeenCalledWith(
      "/api/wifi/orders",
      { packageId: "WIFI-60" },
      { headers: { "Idempotency-Key": "idem-fixed" } },
    );
  });
});

describe("WifiPage — return-URL landing mode", () => {
  it("polls order status and shows the active-entitlement state once the order resolves to ENTITLEMENT_ACTIVE", async () => {
    rememberWifiOrderId("idem-return-1", "order-42");
    const activeOrder: WifiOrderDTO = {
      id: "order-42",
      packageId: "WIFI-60",
      status: "ENTITLEMENT_ACTIVE",
      amountMinor: 1500,
      currency: "PEN",
      sirRegistered: false,
      receiptIssued: false,
      entitlementRef: "ENT-1",
      entitlementExpiresAt: "2026-01-01T13:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const apiClient = buildFakeApiClient({
      get: vi.fn().mockImplementation((path: string) => {
        if (path === "/api/wifi/orders/order-42") return Promise.resolve(activeOrder);
        return Promise.reject(new Error(`unexpected path ${path}`));
      }),
    });

    renderPage(apiClient, { getSearch: () => "?order=idem-return-1" });

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/active/i));
  });

  it("shows a not-found message when the return URL's idempotencyKey has no remembered orderId", async () => {
    const apiClient = buildFakeApiClient();

    renderPage(apiClient, { getSearch: () => "?order=never-remembered-key" });

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't find/i);
  });
});
