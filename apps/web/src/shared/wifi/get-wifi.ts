import type { WifiOrderDTO, WifiPackageDTO } from "contracts";
import type { ApiClient } from "../api/client.js";

/**
 * Thin fetch wrappers for the `wifi-checkout` module's routes (tasks
 * 10.1-10.3), matching `shared/content/get-content.ts`'s convention: one
 * function per endpoint, so callers/hooks are testable against an injected
 * fake `ApiClient` instead of mocking `fetch`.
 */
export async function getWifiPackages(apiClient: ApiClient): Promise<WifiPackageDTO[]> {
  return apiClient.get<WifiPackageDTO[]>("/api/wifi/packages");
}

export interface CreateWifiOrderResult {
  order: WifiOrderDTO;
  redirectUrl: string;
}

/**
 * `idempotencyKey` travels as the `Idempotency-Key` header (design-interfaces
 * HTTP surface) — generated client-side per checkout attempt (task 10.4),
 * never reused across two distinct purchase attempts.
 */
export async function createWifiOrder(
  apiClient: ApiClient,
  packageId: string,
  idempotencyKey: string,
): Promise<CreateWifiOrderResult> {
  return apiClient.post<CreateWifiOrderResult>(
    "/api/wifi/orders",
    { packageId },
    { headers: { "Idempotency-Key": idempotencyKey } },
  );
}

export async function getWifiOrderStatus(apiClient: ApiClient, orderId: string): Promise<WifiOrderDTO> {
  return apiClient.get<WifiOrderDTO>(`/api/wifi/orders/${orderId}`);
}
