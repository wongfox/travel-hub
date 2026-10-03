import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { ContentResult, FaqEntry, MenuSection, RichContent } from "contracts";
import type { ApiClient } from "../api/client.js";
import { getDestination, getFaq, getMenu } from "./get-content.js";
import type { DestinationSection } from "./destination-section.js";

/**
 * TanStack Query hooks (design Decision 1) backing `help-center` (task 9.2),
 * `onboard-menu` (task 9.3), and `destination-content` (task 9.4) — one hook
 * per `content` route, matching `shared/trip/use-trip-query.ts`'s convention.
 */
export function useFaqQuery(apiClient: ApiClient): UseQueryResult<ContentResult<FaqEntry[]>> {
  return useQuery({ queryKey: ["content", "faq"], queryFn: () => getFaq(apiClient) });
}

export function useMenuQuery(apiClient: ApiClient): UseQueryResult<ContentResult<MenuSection[]>> {
  return useQuery({ queryKey: ["content", "menu"], queryFn: () => getMenu(apiClient) });
}

export function useDestinationQuery(
  apiClient: ApiClient,
  section: DestinationSection,
): UseQueryResult<ContentResult<RichContent>> {
  return useQuery({
    queryKey: ["content", "destination", section],
    queryFn: () => getDestination(apiClient, section),
  });
}
