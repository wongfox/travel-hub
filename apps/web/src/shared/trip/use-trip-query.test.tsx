import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { ApiClient } from "../api/client.js";
import type { TripDTO } from "contracts";
import { useTripQuery } from "./use-trip-query.js";

function buildFakeApiClient(get: ApiClient["get"]): ApiClient {
  return { get, post: vi.fn(), delete: vi.fn() };
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useTripQuery", () => {
  it("fetches and returns the trip overview via the injected api client", async () => {
    const trip = { linkId: "link-1" } as TripDTO;
    const get = vi.fn().mockResolvedValue(trip);
    const apiClient = buildFakeApiClient(get);

    const { result } = renderHook(() => useTripQuery(apiClient), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(trip);
    expect(get).toHaveBeenCalledWith("/api/trip");
  });

  it("surfaces a failed fetch as an error state instead of throwing", async () => {
    const get = vi.fn().mockRejectedValue(new Error("simulated 401"));
    const apiClient = buildFakeApiClient(get);

    const { result } = renderHook(() => useTripQuery(apiClient), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
