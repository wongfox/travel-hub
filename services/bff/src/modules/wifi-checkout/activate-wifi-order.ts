import { WifiOrderNotFoundError, WifiPackageNotFoundError } from "./errors.js";
import type { WifiEntitlementPort, WifiOrderRecord, WifiOrderStore, WifiPackageStore } from "./ports.js";
import type { AnalyticsRecorder } from "../analytics/analytics-recorder.js";
import { recordAnalyticsBestEffort } from "../analytics/analytics-recorder.js";

export interface ActivateWifiOrderDeps {
  orderStore: Pick<WifiOrderStore, "findById" | "transition">;
  packageStore: Pick<WifiPackageStore, "findById">;
  entitlement: Pick<WifiEntitlementPort, "grant">;
  /** Injectable clock for deterministic tests; defaults to `Date.now`. */
  now?: () => Date;
  /** `usage-analytics` funnel instrumentation (task 12.2); omitted entirely, this use case behaves exactly as before this task. */
  analytics?: Pick<AnalyticsRecorder, "record">;
}

/**
 * Entitlement-first activation (task 10.3, design Decision 8): on `PAID`,
 * grants the onboard-network entitlement and transitions the order to
 * `ENTITLEMENT_ACTIVE` BEFORE SIR registration or e-receipt issuance are
 * even attempted (those are separate, independently retried steps — see
 * `wifi-order-jobs.ts`). Idempotent: a repeated call against an order that
 * is no longer `PAID` (already `ENTITLEMENT_ACTIVE`, or not yet `PAID`) is a
 * no-op that returns the order unchanged, so a retried worker invocation
 * never grants a second entitlement — `WifiEntitlementPort.grant` is itself
 * idempotent per `orderId` too, as a second line of defense.
 */
export async function activateWifiOrder(orderId: string, deps: ActivateWifiOrderDeps): Promise<WifiOrderRecord> {
  const order = await deps.orderStore.findById(orderId);
  if (!order) {
    throw new WifiOrderNotFoundError(orderId);
  }
  if (order.status !== "PAID") {
    return order;
  }

  const pkg = await deps.packageStore.findById(order.packageId);
  if (!pkg) {
    throw new WifiPackageNotFoundError(order.packageId);
  }

  const { entitlementRef } = await deps.entitlement.grant({
    orderId: order.id,
    packageCode: pkg.code,
    durationMinutes: pkg.durationMinutes,
    legRef: order.legRef,
  });

  const now = deps.now ? deps.now() : new Date();
  const entitlementExpiresAt = new Date(now.getTime() + pkg.durationMinutes * 60_000).toISOString();

  const activated = await deps.orderStore.transition(order.id, "ENTITLEMENT_ACTIVE", {
    entitlementRef,
    entitlementExpiresAt,
  });

  // Funnel event 5/5 (task 12.2): only on a REAL transition, never on the
  // early-return no-op path above (a retried worker invocation against an
  // already-activated order must not record a second entitlement-activated
  // event).
  await recordAnalyticsBestEffort(deps.analytics, {
    reservationRef: order.reservationRef,
    name: "wifi_entitlement_activated",
    props: { packageId: order.packageId },
  });

  return activated;
}
