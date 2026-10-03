import { WifiOrderNotFoundError, WifiPackageNotFoundError } from "./errors.js";
import type { WifiEntitlementPort, WifiOrderRecord, WifiOrderStore, WifiPackageStore } from "./ports.js";

export interface ActivateWifiOrderDeps {
  orderStore: Pick<WifiOrderStore, "findById" | "transition">;
  packageStore: Pick<WifiPackageStore, "findById">;
  entitlement: Pick<WifiEntitlementPort, "grant">;
  /** Injectable clock for deterministic tests; defaults to `Date.now`. */
  now?: () => Date;
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

  return deps.orderStore.transition(order.id, "ENTITLEMENT_ACTIVE", { entitlementRef, entitlementExpiresAt });
}
