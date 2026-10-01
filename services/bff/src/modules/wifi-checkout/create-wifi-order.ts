import type { Locale } from "contracts";
import { WifiPackageNotFoundError } from "./errors.js";
import type { PaymentGatewayPort, WifiOrderRecord, WifiOrderStore, WifiPackageStore } from "./ports.js";
import type { AnalyticsRecorder } from "../analytics/analytics-recorder.js";
import { recordAnalyticsBestEffort } from "../analytics/analytics-recorder.js";

export interface CreateWifiOrderInput {
  reservationRef: string;
  passengerRef: string;
  packageId: string;
  idempotencyKey: string;
  locale: Locale;
  returnUrl: string;
  /** The leg this WiFi entitlement will apply to (task 10.3's `WifiEntitlementPort.grant`); optional for backward compatibility with callers that predate task 10.3. */
  legRef?: string;
  /** The buyer's contact email (task 10.3's `EReceiptPort.issue`); optional for backward compatibility with callers that predate task 10.3. */
  buyerEmail?: string;
}

export interface CreateWifiOrderDeps {
  orderStore: Pick<WifiOrderStore, "create" | "transition">;
  packageStore: Pick<WifiPackageStore, "findById">;
  paymentGateway: Pick<PaymentGatewayPort, "createHostedSession">;
  /** `usage-analytics` funnel instrumentation (task 12.2); omitted entirely, this use case behaves exactly as before this task. */
  analytics?: Pick<AnalyticsRecorder, "record">;
}

export interface CreateWifiOrderResult {
  order: WifiOrderRecord;
  redirectUrl: string;
}

/**
 * `POST /api/wifi/orders` use case (task 10.1, design Decision 8):
 * `CREATED -> PAYMENT_PENDING`. Idempotent at two layers, matching the
 * design's `wifi_order.idempotency_key unique` column plus
 * `PaymentGatewayPort.createHostedSession`'s own `idempotencyKey` parameter:
 * a second call with the same `idempotencyKey` reuses the existing order row
 * (`WifiOrderStore.create`'s own dedupe — never a second row, task 10.1's
 * acceptance criterion) and relies on the gateway's own idempotency to avoid
 * a duplicate hosted session/charge, which also lets a prior attempt that
 * crashed before transitioning succeed on retry instead of getting stuck at
 * `CREATED` forever.
 */
export async function createWifiOrder(
  input: CreateWifiOrderInput,
  deps: CreateWifiOrderDeps,
): Promise<CreateWifiOrderResult> {
  const pkg = await deps.packageStore.findById(input.packageId);
  if (!pkg) {
    throw new WifiPackageNotFoundError(input.packageId);
  }

  const order = await deps.orderStore.create({
    reservationRef: input.reservationRef,
    passengerRef: input.passengerRef,
    packageId: pkg.id,
    amountMinor: pkg.priceMinor,
    currency: pkg.currency,
    idempotencyKey: input.idempotencyKey,
    legRef: input.legRef ?? "",
    buyerEmail: input.buyerEmail ?? "",
  });

  // Funnel event 2/5 (task 12.2): a package was just selected for this order.
  await recordAnalyticsBestEffort(deps.analytics, {
    reservationRef: input.reservationRef,
    name: "wifi_package_selected",
    props: { packageId: pkg.id },
  });

  const session = await deps.paymentGateway.createHostedSession({
    orderId: order.id,
    amountMinor: order.amountMinor,
    currency: order.currency,
    returnUrl: input.returnUrl,
    locale: input.locale,
    idempotencyKey: input.idempotencyKey,
  });

  // Funnel event 3/5 (task 12.2): the passenger is being redirected to the
  // gateway's hosted page — a payment attempt has begun.
  await recordAnalyticsBestEffort(deps.analytics, {
    reservationRef: input.reservationRef,
    name: "wifi_payment_attempted",
    props: { packageId: pkg.id },
  });

  const resolvedOrder =
    order.status === "CREATED"
      ? await deps.orderStore.transition(order.id, "PAYMENT_PENDING", { gatewaySessionRef: session.sessionRef })
      : order;

  return { order: resolvedOrder, redirectUrl: session.redirectUrl };
}
