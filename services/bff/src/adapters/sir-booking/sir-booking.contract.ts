import type { ConformanceSpec } from "../_conformance-harness/conformance-harness.js";
import { BookingNotFoundError } from "../../modules/booking/errors.js";
import type { SirBookingPort } from "../../modules/booking/ports.js";

/**
 * Conformance suite for `SirBookingPort` (design Decision 6): runs against
 * the stub in CI, and against any real adapter once the SIR contract is
 * documented (design's Open Questions — SIR contract is still undocumented).
 * Every case must hold regardless of which two seeded reservations an
 * adapter's fixture data uses, so it only asserts observable contract
 * behavior (shape, error type, non-cross-contamination), never a specific
 * reservation's exact field values.
 */
export const sirBookingContract: ConformanceSpec<SirBookingPort> = {
  cases: [
    {
      name: "getReservation returns a reservation whose passengers/legs belong only to the requested reference",
      async run(port) {
        const first = await port.getReservation({ reservationRef: "RES-1001" });
        const second = await port.getReservation({ reservationRef: "RES-2002" });
        if (first.reservationRef !== "RES-1001" || second.reservationRef !== "RES-2002") {
          throw new Error("getReservation did not echo back the requested reservationRef");
        }
        if (JSON.stringify(first.passengers) === JSON.stringify(second.passengers)) {
          throw new Error("two distinct reservations resolved to identical passenger data");
        }
      },
    },
    {
      name: "getReservation throws BookingNotFoundError for an unknown reservation reference",
      async run(port) {
        let thrown: unknown;
        try {
          await port.getReservation({ reservationRef: "RES-DOES-NOT-EXIST" });
        } catch (error) {
          thrown = error;
        }
        if (!(thrown instanceof BookingNotFoundError)) {
          throw new Error("expected a BookingNotFoundError to be thrown for an unknown reservation");
        }
      },
    },
    {
      name: "getRelocations returns an array (possibly empty) for a known reservation",
      async run(port) {
        const relocations = await port.getRelocations({ reservationRef: "RES-1001" });
        if (!Array.isArray(relocations)) {
          throw new Error("getRelocations did not return an array");
        }
      },
    },
    {
      name: "getContactForLinkDelivery returns null, not a thrown error, for a non-matching verifier",
      async run(port) {
        const contact = await port.getContactForLinkDelivery(
          { reservationRef: "RES-1001" },
          { surname: "Definitely Not A Real Surname" },
        );
        if (contact !== null) {
          throw new Error("expected null for a non-matching reissue verifier");
        }
      },
    },
  ],
};
