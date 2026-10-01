import { randomUUID } from "node:crypto";
import type { WifiEntitlementPort } from "../../modules/wifi-checkout/ports.js";

type EntitlementState = "granted" | "active" | "expired" | "revoked";

interface EntitlementRecord {
  entitlementRef: string;
  state: EntitlementState;
  durationMinutes: number;
}

export interface WifiEntitlementStub extends WifiEntitlementPort {
  /** Every `grant` call this stub instance has accepted, in call order. */
  readonly grantCalls: { orderId: string }[];
  /** Test/dev-only: makes the next `grant` call reject once, then succeed normally. */
  simulateFailureOnce(): void;
}

/**
 * Deterministic, in-memory `WifiEntitlementPort` stub (design Decision 6/9):
 * `grant` is idempotent per `orderId` — a retried activation attempt for an
 * already-granted order returns the same `entitlementRef` instead of
 * registering a second entitlement with the (still undefined) captive-portal
 * system, same convention as `PaymentGatewayPort.createHostedSession`.
 */
export function createWifiEntitlementStub(): WifiEntitlementStub {
  const entitlementRefByOrderId = new Map<string, string>();
  const entitlementsByRef = new Map<string, EntitlementRecord>();
  const grantCalls: { orderId: string }[] = [];
  let failNext = false;

  function consumeFailureInjection(): void {
    if (failNext) {
      failNext = false;
      throw new Error("simulated WifiEntitlementPort failure");
    }
  }

  return {
    grantCalls,

    simulateFailureOnce() {
      failNext = true;
    },

    async grant(input) {
      consumeFailureInjection();
      grantCalls.push({ orderId: input.orderId });

      const existingRef = entitlementRefByOrderId.get(input.orderId);
      if (existingRef) return { entitlementRef: existingRef };

      const entitlementRef = randomUUID();
      entitlementRefByOrderId.set(input.orderId, entitlementRef);
      entitlementsByRef.set(entitlementRef, {
        entitlementRef,
        state: "granted",
        durationMinutes: input.durationMinutes,
      });
      return { entitlementRef };
    },

    async buildRedemption(entitlementRef) {
      const record = entitlementsByRef.get(entitlementRef);
      if (!record) {
        throw new Error(`No WiFi entitlement found for ref "${entitlementRef}"`);
      }
      return {
        kind: "url",
        value: `https://stub-captive-portal.local/redeem/${entitlementRef}`,
        expiresAt: new Date(Date.now() + record.durationMinutes * 60_000).toISOString(),
      };
    },

    async status(entitlementRef) {
      const record = entitlementsByRef.get(entitlementRef);
      if (!record) {
        return { state: "expired" };
      }
      return { state: record.state };
    },

    async revoke(entitlementRef) {
      const record = entitlementsByRef.get(entitlementRef);
      if (!record) return;
      record.state = "revoked";
    },
  };
}
