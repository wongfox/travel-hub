import type { ConformanceSpec } from "../_conformance-harness/conformance-harness.js";
import type { EReceiptPort } from "../../modules/wifi-checkout/ports.js";

const ISSUE_INPUT = {
  orderId: "order-contract",
  buyerEmail: "contract@example.com",
  lines: [{ description: "WiFi package", amountMinor: 1500 }],
  currency: "PEN" as const,
};

/**
 * Conformance suite for `EReceiptPort` (design Decision 6): runs against the
 * stub in CI, and against a real SUNAT-authorized e-invoicing adapter once
 * one is chosen (design's Open Questions).
 */
export const eReceiptContract: ConformanceSpec<EReceiptPort> = {
  cases: [
    {
      name: "issue returns a non-empty receiptRef",
      async run(port) {
        const result = await port.issue({ ...ISSUE_INPUT, idempotencyKey: "idem-contract-1" });
        if (!result.receiptRef) {
          throw new Error("issue did not return a receiptRef");
        }
      },
    },
    {
      name: "issue is idempotent: a repeated idempotencyKey returns the same receiptRef",
      async run(port) {
        const first = await port.issue({ ...ISSUE_INPUT, idempotencyKey: "idem-contract-2" });
        const second = await port.issue({ ...ISSUE_INPUT, idempotencyKey: "idem-contract-2" });
        if (first.receiptRef !== second.receiptRef) {
          throw new Error("issue created a second receipt for a repeated idempotencyKey");
        }
      },
    },
  ],
};
