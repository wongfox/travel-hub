import type { ConformanceSpec } from "../_conformance-harness/conformance-harness.js";
import type { SirPosPort } from "../../modules/booking/ports.js";

const SALE = {
  reservationRef: "RES-CONTRACT",
  passengerRef: "PAX-CONTRACT",
  packageCode: "wifi-60",
  amountMinor: 1500,
  currency: "PEN",
};

/**
 * Conformance suite for `SirPosPort` (design Decision 6): runs against the
 * stub in CI, and against a real SIR adapter once the SIR contract is
 * documented (design's Open Questions).
 */
export const sirPosContract: ConformanceSpec<SirPosPort> = {
  cases: [
    {
      name: "registerSale returns a non-empty saleRef",
      async run(port) {
        const result = await port.registerSale(SALE, "idem-contract-1");
        if (!result.saleRef) {
          throw new Error("registerSale did not return a saleRef");
        }
      },
    },
    {
      name: "registerSale is idempotent: a repeated idempotencyKey returns the same saleRef",
      async run(port) {
        const first = await port.registerSale(SALE, "idem-contract-2");
        const second = await port.registerSale(SALE, "idem-contract-2");
        if (first.saleRef !== second.saleRef) {
          throw new Error("registerSale created a second POS entry for a repeated idempotencyKey");
        }
      },
    },
    {
      name: "voidSale resolves without throwing for a previously registered sale",
      async run(port) {
        const { saleRef } = await port.registerSale(SALE, "idem-contract-3");
        await port.voidSale(saleRef, "contract-test-void");
      },
    },
  ],
};
