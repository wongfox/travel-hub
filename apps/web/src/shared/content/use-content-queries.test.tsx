import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { ApiClient } from "../api/client.js";
import type { ContentResult, FaqEntry, MenuSection, RichContent } from "contracts";
import { useFaqQuery, useMenuQuery, useDestinationQuery } from "./use-content-queries.js";

function buildFakeApiClient(get: ApiClient["get"]): ApiClient {
  return { get, post: vi.fn(), delete: vi.fn() };
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useFaqQuery", () => {
  it("fetches FAQ content via the injected api client", async () => {
    const faq = { data: [] as FaqEntry[] } as ContentResult<FaqEntry[]>;
    const get = vi.fn().mockResolvedValue(faq);
    const apiClient = buildFakeApiClient(get);

    const { result } = renderHook(() => useFaqQuery(apiClient), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(faq);
    expect(get).toHaveBeenCalledWith("/api/content/faq");
  });
});

describe("useMenuQuery", () => {
  it("fetches menu content via the injected api client", async () => {
    const menu = { data: [] as MenuSection[] } as ContentResult<MenuSection[]>;
    const get = vi.fn().mockResolvedValue(menu);
    const apiClient = buildFakeApiClient(get);

    const { result } = renderHook(() => useMenuQuery(apiClient), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(menu);
    expect(get).toHaveBeenCalledWith("/api/content/menu");
  });
});

describe("useDestinationQuery", () => {
  it("fetches a destination section via the injected api client", async () => {
    const content = { data: {} as RichContent } as ContentResult<RichContent>;
    const get = vi.fn().mockResolvedValue(content);
    const apiClient = buildFakeApiClient(get);

    const { result } = renderHook(() => useDestinationQuery(apiClient, "circuits"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(content);
    expect(get).toHaveBeenCalledWith("/api/content/destination/circuits");
  });
});
