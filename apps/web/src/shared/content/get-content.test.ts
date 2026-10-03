import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "../api/client.js";
import type { ContentResult, FaqEntry, MenuSection, RichContent } from "contracts";
import { getFaq, getMenu, getDestination } from "./get-content.js";

function buildFakeApiClient(get: ApiClient["get"]): ApiClient {
  return { get, post: vi.fn(), delete: vi.fn() };
}

describe("getFaq", () => {
  it("fetches FAQ content from GET /api/content/faq", async () => {
    const faq = { data: [] as FaqEntry[] } as ContentResult<FaqEntry[]>;
    const get = vi.fn().mockResolvedValue(faq);
    const apiClient = buildFakeApiClient(get);

    const result = await getFaq(apiClient);

    expect(get).toHaveBeenCalledWith("/api/content/faq");
    expect(result).toBe(faq);
  });
});

describe("getMenu", () => {
  it("fetches onboard-menu content from GET /api/content/menu", async () => {
    const menu = { data: [] as MenuSection[] } as ContentResult<MenuSection[]>;
    const get = vi.fn().mockResolvedValue(menu);
    const apiClient = buildFakeApiClient(get);

    const result = await getMenu(apiClient);

    expect(get).toHaveBeenCalledWith("/api/content/menu");
    expect(result).toBe(menu);
  });
});

describe("getDestination", () => {
  it("fetches a destination section from GET /api/content/destination/:section", async () => {
    const content = { data: {} as RichContent } as ContentResult<RichContent>;
    const get = vi.fn().mockResolvedValue(content);
    const apiClient = buildFakeApiClient(get);

    const result = await getDestination(apiClient, "poi_map");

    expect(get).toHaveBeenCalledWith("/api/content/destination/poi_map");
    expect(result).toBe(content);
  });
});
