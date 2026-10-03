import type { AnalyticsEventName, PaymentEventType, WifiOrderStatus } from "contracts";
import { WifiOrderNotFoundError } from "./errors.js";
import type { PaymentGatewayPort, WifiOrderStore } from "./ports.js";
import type { AnalyticsRecorder } from "../analytics/analytics-recorder.js";
import { recordAnalyticsBestEffort } from "../analytics/analytics-recorder.js";

export interface HandlePaymentWebhookDeps {
  paymentGateway: Pick<PaymentGatewayPort, "parseWebhook">;
  orderStore: Pick<WifiOrderStore, "findByIdempotencyKey" | "transition">;
  /** `usage-analytics` funnel instrumentation (task 12.2); omitted entirely, this use case behaves exactly as before this task. */
  analytics?: Pick<AnalyticsRecorder, "record">;
}

/** Funnel event 4/5 (task 12.2): only `payment_succeeded`/`payment_failed` map to a funnel event — `refund_completed` is not part of the five named funnel steps. */
const FUNNEL_EVENT_FOR_PAYMENT_EVENT: Partial<Record<PaymentEventType, AnalyticsEventName>> = {
  payment_succeeded: "wifi_payment_succeeded",
  payment_failed: "wifi_payment_failed",
};

export interface HandlePaymentWebhookResult {
  applied: boolean;
  orderId: string | null;
}

const TARGET_STATUS_FOR_EVENT: Record<PaymentEventType, WifiOrderStatus> = {
  payment_succeeded: "PAID",
  payment_failed: "PAYMENT_FAILED",
  refund_completed: "REFUNDED",
};

/**
 * Source statuses this webhook handler is allowed to transition out of
 * (task 10.1-10.2 scope only). `PAID`/`ENTITLEMENT_ACTIVE`/`PAYMENT_FAILED`/
 * `REFUND_PENDING`/`REFUNDED` are terminal or WU19-owned from here — an event
 * arriving for an order already past this handler's reach is a no-op, not a
 * backward/duplicate transition.
 */
const REACHABLE_SOURCE_STATUSES: Record<WifiOrderStatus, boolean> = {
  CREATED: true,
  PAYMENT_PENDING: true,
  PAID: false,
  ENTITLEMENT_ACTIVE: false,
  PAYMENT_FAILED: false,
  REFUND_PENDING: false,
  REFUNDED: false,
};

/**
 * `POST /webhooks/payments/:provider` use case (task 10.2): the gateway
 * webhook is authoritative for `PAID` (design Decision 8). An invalid/missing
 * signature propagates `PaymentGatewayPort.parseWebhook`'s thrown error
 * without ever touching order state (RED-worthy acceptance: a rejected
 * webhook must never transition). Replaying the exact same event is a no-op:
 * once an order's `gatewayPaymentRef` already matches `providerRef`, or the
 * order is no longer in a state this event can transition from, nothing is
 * written again — no double transition, no new `wifi_order_event` row
 * (RED-worthy acceptance).
 *
 * Deliberately stops at writing the order/order-event rows: entitlement
 * activation, SIR sale registration and e-receipt issuance (design's "after
 * PAID" steps) are WU19's scope (tasks 10.3-10.5) and are never invoked from
 * here, on success or on a simulated payment failure alike.
 */
export async function handlePaymentWebhook(
  rawBody: Buffer,
  headers: Record<string, string>,
  deps: HandlePaymentWebhookDeps,
): Promise<HandlePaymentWebhookResult> {
  const event = await deps.paymentGateway.parseWebhook(rawBody, headers);

  if (!event.orderIdempotencyKey) {
    return { applied: false, orderId: null };
  }

  const order = await deps.orderStore.findByIdempotencyKey(event.orderIdempotencyKey);
  if (!order) {
    throw new WifiOrderNotFoundError(event.orderIdempotencyKey);
  }

  if (order.gatewayPaymentRef === event.providerRef) {
    // Exact-event replay: already applied, do nothing.
    return { applied: false, orderId: order.id };
  }

  if (!REACHABLE_SOURCE_STATUSES[order.status]) {
    return { applied: false, orderId: order.id };
  }

  const toStatus = TARGET_STATUS_FOR_EVENT[event.type];
  await deps.orderStore.transition(order.id, toStatus, { gatewayPaymentRef: event.providerRef });

  const funnelEventName = FUNNEL_EVENT_FOR_PAYMENT_EVENT[event.type];
  if (funnelEventName) {
    await recordAnalyticsBestEffort(deps.analytics, {
      reservationRef: order.reservationRef,
      name: funnelEventName,
      props: { packageId: order.packageId },
    });
  }

  return { applied: true, orderId: order.id };
}
