import { useMutation, useQuery, type UseMutationResult, type UseQueryResult } from "@tanstack/react-query";
import type { WifiOrderDTO, WifiPackageDTO } from "contracts";
import type { ApiClient } from "../api/client.js";
import { createWifiOrder, getWifiOrderStatus, getWifiPackages, type CreateWifiOrderResult } from "./get-wifi.js";

/**
 * TanStack Query hooks (design Decision 1) backing the `wifi` feature (task
 * 10.4), matching `shared/content/use-content-queries.ts`'s convention: one
 * hook per `wifi-checkout` route.
 */
export function useWifiPackagesQuery(apiClient: ApiClient): UseQueryResult<WifiPackageDTO[]> {
  return useQuery({ queryKey: ["wifi", "packages"], queryFn: () => getWifiPackages(apiClient) });
}

export function useCreateWifiOrderMutation(
  apiClient: ApiClient,
): UseMutationResult<CreateWifiOrderResult, Error, { packageId: string; idempotencyKey: string }> {
  return useMutation({
    mutationFn: ({ packageId, idempotencyKey }) => createWifiOrder(apiClient, packageId, idempotencyKey),
  });
}

/** Terminal/stable statuses the return-URL landing view stops polling at (task 10.4). */
const POLL_TERMINAL_STATUSES: WifiOrderDTO["status"][] = [
  "ENTITLEMENT_ACTIVE",
  "PAYMENT_FAILED",
  "REFUNDED",
];

export function useWifiOrderStatusQuery(apiClient: ApiClient, orderId: string | null): UseQueryResult<WifiOrderDTO> {
  return useQuery({
    queryKey: ["wifi", "order", orderId],
    queryFn: () => getWifiOrderStatus(apiClient, orderId!),
    enabled: orderId !== null,
    // Polls the order status after the gateway return (design Decision 8:
    // the webhook, not the return URL, is authoritative for PAID — the
    // return view only ever polls, never assumes success from navigation
    // alone) until a terminal/active status is reached.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status && POLL_TERMINAL_STATUSES.includes(status)) {
        return false;
      }
      return 2000;
    },
  });
}
