import type { ConformanceSpec } from "../_conformance-harness/conformance-harness.js";
import type { WifiEntitlementPort } from "../../modules/wifi-checkout/ports.js";

/**
 * Conformance suite for `WifiEntitlementPort` (design Decision 6/9): runs
 * against the stub in CI, and against a real captive-portal adapter once one
 * is chosen (design's Open Questions).
 */
export const wifiEntitlementContract: ConformanceSpec<WifiEntitlementPort> = {
  cases: [
    {
      name: "grant returns a non-empty entitlementRef",
      async run(port) {
        const result = await port.grant({
          orderId: "order-contract-1",
          packageCode: "wifi-60",
          durationMinutes: 60,
          legRef: "LEG-1",
        });
        if (!result.entitlementRef) {
          throw new Error("grant did not return an entitlementRef");
        }
      },
    },
    {
      name: "grant is idempotent: a repeated orderId returns the same entitlementRef",
      async run(port) {
        const input = { orderId: "order-contract-2", packageCode: "wifi-60", durationMinutes: 60, legRef: "LEG-1" };
        const first = await port.grant(input);
        const second = await port.grant(input);
        if (first.entitlementRef !== second.entitlementRef) {
          throw new Error("grant registered a second entitlement for a repeated orderId");
        }
      },
    },
    {
      name: "status reflects granted immediately after grant",
      async run(port) {
        const { entitlementRef } = await port.grant({
          orderId: "order-contract-3",
          packageCode: "wifi-60",
          durationMinutes: 60,
          legRef: "LEG-1",
        });
        const result = await port.status(entitlementRef);
        if (result.state !== "granted" && result.state !== "active") {
          throw new Error(`status did not reflect a granted entitlement, got "${result.state}"`);
        }
      },
    },
  ],
};
