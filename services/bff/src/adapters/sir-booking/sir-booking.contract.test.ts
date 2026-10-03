import { describe, expect, it } from "vitest";
import { runConformanceSuite } from "../_conformance-harness/conformance-harness.js";
import { createSirBookingStub } from "./stub.js";
import { sirBookingContract } from "./sir-booking.contract.js";
import type { SirBookingPort } from "../../modules/booking/ports.js";

describe("SirBookingPort conformance", () => {
  it("passes the full conformance suite against the stub adapter", async () => {
    await expect(runConformanceSuite(createSirBookingStub, sirBookingContract)).resolves.toBeUndefined();
  });

  it("fails the conformance suite against an adapter that deviates from the documented contract", async () => {
    function createBrokenAdapter(): SirBookingPort {
      return {
        async getReservation(ref) {
          if (ref.reservationRef === "RES-DOES-NOT-EXIST") {
            // Broken: returns an empty reservation instead of throwing BookingNotFoundError.
            return {
              reservationRef: ref.reservationRef,
              passengers: [],
              legs: [],
              contact: { kind: "email", address: "x" },
            };
          }
          return {
            reservationRef: ref.reservationRef,
            passengers: [{ passengerRef: "P1", ordinal: 1, displayName: `Passenger of ${ref.reservationRef}` }],
            legs: [],
            contact: { kind: "email", address: "x" },
          };
        },
        async getRelocations() {
          return [];
        },
        async getContactForLinkDelivery() {
          return null;
        },
      };
    }

    await expect(runConformanceSuite(createBrokenAdapter, sirBookingContract)).rejects.toThrow(
      /BookingNotFoundError/,
    );
  });
});
