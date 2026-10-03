import { describe, expect, it } from "vitest";
import { createSirBookingStub } from "./stub.js";
import { BookingNotFoundError } from "../../modules/booking/errors.js";

describe("createSirBookingStub", () => {
  it("returns a reservation with its passengers, legs, and tier per leg matching the seed fixture", async () => {
    const stub = createSirBookingStub();

    const reservation = await stub.getReservation({ reservationRef: "RES-1001" });

    expect(reservation.reservationRef).toBe("RES-1001");
    expect(reservation.passengers).toEqual([
      { passengerRef: "P1", ordinal: 1, displayName: "Ana Torres" },
      { passengerRef: "P2", ordinal: 2, displayName: "Luis Torres" },
    ]);
    expect(reservation.legs).toHaveLength(1);
    expect(reservation.legs[0]?.tier).toBe("PRIME");
  });

  it("returns a different reservation's own data for a second reservation reference, proving no cross-contamination", async () => {
    const stub = createSirBookingStub();

    const first = await stub.getReservation({ reservationRef: "RES-1001" });
    const second = await stub.getReservation({ reservationRef: "RES-2002" });

    expect(second.reservationRef).toBe("RES-2002");
    expect(second.passengers).not.toEqual(first.passengers);
    expect(second.legs[0]?.tier).toBe("VOYAGER");
  });

  it("throws BookingNotFoundError for a reservation reference the seed does not contain", async () => {
    const stub = createSirBookingStub();

    await expect(stub.getReservation({ reservationRef: "RES-DOES-NOT-EXIST" })).rejects.toBeInstanceOf(
      BookingNotFoundError,
    );
  });

  it("returns recorded relocation events for a reservation that has them", async () => {
    const stub = createSirBookingStub();

    const relocations = await stub.getRelocations({ reservationRef: "RES-2002" });

    expect(relocations).toEqual([
      { legRef: "L1", recordedAt: "2026-10-30T12:00:00-05:00", reason: "capacity change", newSeat: "3C" },
    ]);
  });

  it("returns an empty array for a reservation with no relocation events", async () => {
    const stub = createSirBookingStub();

    const relocations = await stub.getRelocations({ reservationRef: "RES-1001" });

    expect(relocations).toEqual([]);
  });

  it("resolves the contact channel when the reissue verifier's surname matches a passenger on the reservation", async () => {
    const stub = createSirBookingStub();

    const contact = await stub.getContactForLinkDelivery({ reservationRef: "RES-1001" }, { surname: "Torres" });

    expect(contact).toEqual({ kind: "email", address: "ana.torres@example.com" });
  });

  it("returns null, not an error, when the reissue verifier does not match any passenger (no enumeration signal)", async () => {
    const stub = createSirBookingStub();

    const contact = await stub.getContactForLinkDelivery({ reservationRef: "RES-1001" }, { surname: "Nobody" });

    expect(contact).toBeNull();
  });

  it("returns null for an unknown reservation reference too, not a thrown error, keeping the response shape uniform", async () => {
    const stub = createSirBookingStub();

    const contact = await stub.getContactForLinkDelivery(
      { reservationRef: "RES-DOES-NOT-EXIST" },
      { surname: "Torres" },
    );

    expect(contact).toBeNull();
  });
});
