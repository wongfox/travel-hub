/** Thrown by `PaymentGatewayPort.parseWebhook` when the raw body's signature does not verify against `headers` (design-interfaces: "verifies signature or throws"). */
export class InvalidWebhookSignatureError extends Error {
  constructor() {
    super("Payment webhook signature verification failed");
    this.name = "InvalidWebhookSignatureError";
  }
}

/** Thrown when a WiFi order cannot be resolved by id or by idempotency key. */
export class WifiOrderNotFoundError extends Error {
  constructor(identifier: string) {
    super(`No WiFi order found for "${identifier}"`);
    this.name = "WifiOrderNotFoundError";
  }
}

/** Thrown by `createWifiOrder` when `packageId` does not resolve to an active `WifiPackageRecord`. */
export class WifiPackageNotFoundError extends Error {
  constructor(packageId: string) {
    super(`No WiFi package found for id "${packageId}"`);
    this.name = "WifiPackageNotFoundError";
  }
}
