import type { ContentResult, FaqEntry, MenuSection, RichContent } from "contracts";
import type { ApiClient } from "../api/client.js";
import type { DestinationSection } from "./destination-section.js";

/**
 * Thin fetch wrappers for the `content` module's routes (tasks 9.2-9.4),
 * matching `shared/trip/get-trip.ts`'s convention: one function per
 * endpoint, so callers/hooks are testable against an injected fake
 * `ApiClient` instead of mocking `fetch`.
 */
export async function getFaq(apiClient: ApiClient): Promise<ContentResult<FaqEntry[]>> {
  return apiClient.get<ContentResult<FaqEntry[]>>("/api/content/faq");
}

export async function getMenu(apiClient: ApiClient): Promise<ContentResult<MenuSection[]>> {
  return apiClient.get<ContentResult<MenuSection[]>>("/api/content/menu");
}

export async function getDestination(
  apiClient: ApiClient,
  section: DestinationSection,
): Promise<ContentResult<RichContent>> {
  return apiClient.get<ContentResult<RichContent>>(`/api/content/destination/${section}`);
}
