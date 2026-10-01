import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "../api/client.js";
import type { WifiOrderDTO, WifiPackageDTO } from "contracts";
import { createWifiOrder, getWifiOrderStatus, getWifiPackages } from "./get-wifi.js";

function buildFakeApiClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return { get: vi.fn(), post: vi.fn(), delete: vi.fn(), ...overrides };
}

describe("getWifiPackages", () => {
  it("fetches the package catalog from GET /api/wifi/packages", async () => {
    const packages = [] as WifiPackageDTO[];
    const get = vi.fn().mockResolvedValue(packages);
    const apiClient = buildFakeApiClient({ get });

    const result = await getWifiPackages(apiClient);

    expect(get).toHaveBeenCalledWith("/api/wifi/packages");
    expect(result).toBe(packages);
  });
});

describe("createWifiOrder", () => {
  it("POSTs to /api/wifi/orders with the package id and an Idempotency-Key header", async () => {
    const response = { order: {} as WifiOrderDTO, redirectUrl: "https://stub-gateway.local/pay/1" };
    const post = vi.fn().mockResolvedValue(response);
    const apiClient = buildFakeApiClient({ post });

    const result = await createWifiOrder(apiClient, "WIFI-60", "idem-key-1");

    expect(post).toHaveBeenCalledWith(
      "/api/wifi/orders",
      { packageId: "WIFI-60" },
      { headers: { "Idempotency-Key": "idem-key-1" } },
    );
    expect(result).toBe(response);
  });
});

describe("getWifiOrderStatus", () => {
  it("fetches order status from GET /api/wifi/orders/:id", async () => {
    const order = {} as WifiOrderDTO;
    const get = vi.fn().mockResolvedValue(order);
    const apiClient = buildFakeApiClient({ get });

    const result = await getWifiOrderStatus(apiClient, "order-1");

    expect(get).toHaveBeenCalledWith("/api/wifi/orders/order-1");
    expect(result).toBe(order);
  });
});
