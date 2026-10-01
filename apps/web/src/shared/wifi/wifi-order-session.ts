const STORAGE_KEY_PREFIX = "th-wifi-order:";

/**
 * Maps a checkout attempt's `idempotencyKey` to the real `WifiOrderDTO.id`
 * the BFF returned at order-creation time (task 10.4).
 *
 * `buildReturnUrl` (`wifi-checkout/http.ts`, task 10.1) encodes the return
 * URL as `/trip/wifi?order=<idempotencyKey>` — the idempotency key, not the
 * order id `GET /api/wifi/orders/:id` actually requires. Rather than
 * changing that established WU18 contract, the client itself bridges the
 * two: it already receives the real order id in `POST /api/wifi/orders`'s
 * own response, before ever redirecting to the gateway, so it remembers
 * `idempotencyKey -> orderId` in `sessionStorage` (survives the full-page
 * navigation to the gateway and back; cleared with the tab) and resolves it
 * back on return. A narrowly-scoped client-side resolution, not a business
 * decision — same "documented, honest" convention as this codebase's other
 * TBD resolutions (e.g. WU18's `passengerScope[0]` choice).
 */
export function rememberWifiOrderId(idempotencyKey: string, orderId: string): void {
  try {
    sessionStorage.setItem(`${STORAGE_KEY_PREFIX}${idempotencyKey}`, orderId);
  } catch {
    // sessionStorage can throw in a locked-down webview (design's own
    // documented in-app-webview risk, Decision 15); the return-URL landing
    // view degrades to its own-order-not-found fallback instead of crashing.
  }
}

export function resolveWifiOrderId(idempotencyKey: string): string | null {
  try {
    return sessionStorage.getItem(`${STORAGE_KEY_PREFIX}${idempotencyKey}`);
  } catch {
    return null;
  }
}
