import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { ApiClient } from "../api/client.js";
import type { WifiOrderDTO, WifiPackageDTO } from "contracts";
import { useCreateWifiOrderMutation, useWifiOrderStatusQuery, useWifiPackagesQuery } from "./use-wifi-queries.js";

function buildFakeApiClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return { get: vi.fn(), post: vi.fn(), delete: vi.fn(), ...overrides };
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useWifiPackagesQuery", () => {
  it("fetches the package catalog via the injected api client", async () => {
    const packages = [] as WifiPackageDTO[];
    const get = vi.fn().mockResolvedValue(packages);
    const apiClient = buildFakeApiClient({ get });

    const { result } = renderHook(() => useWifiPackagesQuery(apiClient), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(packages);
    expect(get).toHaveBeenCalledWith("/api/wifi/packages");
  });
});

describe("useCreateWifiOrderMutation", () => {
  it("creates an order via the injected api client", async () => {
    const response = { order: {} as WifiOrderDTO, redirectUrl: "https://stub-gateway.local/pay/1" };
    const post = vi.fn().mockResolvedValue(response);
    const apiClient = buildFakeApiClient({ post });

    const { result } = renderHook(() => useCreateWifiOrderMutation(apiClient), { wrapper });
    result.current.mutate({ packageId: "WIFI-60", idempotencyKey: "idem-1" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(response);
    expect(post).toHaveBeenCalledWith(
      "/api/wifi/orders",
      { packageId: "WIFI-60" },
      { headers: { "Idempotency-Key": "idem-1" } },
    );
  });
});

describe("useWifiOrderStatusQuery", () => {
  it("fetches order status via the injected api client when given an orderId", async () => {
    const order = { status: "PAYMENT_PENDING" } as WifiOrderDTO;
    const get = vi.fn().mockResolvedValue(order);
    const apiClient = buildFakeApiClient({ get });

    const { result } = renderHook(() => useWifiOrderStatusQuery(apiClient, "order-1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(order);
    expect(get).toHaveBeenCalledWith("/api/wifi/orders/order-1");
  });

  it("stays disabled (never calls the api client) when orderId is null", async () => {
    const get = vi.fn().mockResolvedValue({} as WifiOrderDTO);
    const apiClient = buildFakeApiClient({ get });

    const { result } = renderHook(() => useWifiOrderStatusQuery(apiClient, null), { wrapper });

    expect(result.current.isPending).toBe(true);
    expect(get).not.toHaveBeenCalled();
  });
});
