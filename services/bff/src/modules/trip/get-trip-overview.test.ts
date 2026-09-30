import { describe, expect, it } from "vitest";
import { TripDTOSchema } from "contracts";
import { getTripOverview } from "./get-trip-overview.js";
import type { AccessLinkRecord } from "../trip-access/access-link-store.js";
import type { SirBookingPort, SirReservation, SirRelocation } from "../booking/ports.js";

function accessLink(overrides: Partial<AccessLinkRecord> = {}): AccessLinkRecord {
  return {
    id: "link-1",
    tokenHash: "hash",
    reservationRef: "RES-1001",
    passengerScope: [],
    issuedAt: "2026-10-01T00:00:00.000Z",
    expiresAt: "2027-01-01T00:00:00.000Z",
    revokedAt: null,
    supersededBy: null,
    issueChannel: "email",
    ...overrides,
  };
}

function fakeSirBooking(
  reservation: SirReservation,
  relocations: SirRelocation[] = [],
): Pick<SirBookingPort, "getReservation" | "getRelocations"> {
  return {
    async getReservation() {
      return reservation;
    },
    async getRelocations() {
      return relocations;
    },
  };
}

const reservation: SirReservation = {
  reservationRef: "RES-1001",
  contact: { kind: "email", address: "ana@example.com" },
  passengers: [
    { passengerRef: "P1", ordinal: 1, displayName: "Ana Torres" },
    { passengerRef: "P2", ordinal: 2, displayName: "Luis Torres" },
  ],
  legs: [
    {
      legRef: "L1",
      origin: "Ollantaytambo",
      destination: "Machu Picchu Pueblo",
      departureLocal: "2026-11-02T08:10:00-05:00",
      arrivalLocal: "2026-11-02T09:40:00-05:00",
      tier: "PRIME",
      status: "SCHEDULED",
    },
  ],
};

describe("getTripOverview", () => {
  it("builds a TripDTO with legs, tier, and features resolved from the flag table", async () => {
    const trip = await getTripOverview(accessLink(), { sirBooking: fakeSirBooking(reservation) });

    expect(trip.legs).toHaveLength(1);
    expect(trip.legs[0]).toMatchObject({ id: "L1", tier: "PRIME", status: "SCHEDULED" });
    expect(trip.features.wifiCheckout).toBe(false);
    expect(trip.linkId).toBe("link-1");
  });

  it("scopes passengers to the access link's passengerScope, excluding out-of-scope passengers", async () => {
    const trip = await getTripOverview(accessLink({ passengerScope: ["P1"] }), {
      sirBooking: fakeSirBooking(reservation),
    });

    expect(trip.passengers).toHaveLength(1);
    expect(trip.passengers[0]?.displayName).toBe("Ana Torres");
  });

  it("includes every passenger when passengerScope is empty (all passengers on the reservation)", async () => {
    const trip = await getTripOverview(accessLink({ passengerScope: [] }), {
      sirBooking: fakeSirBooking(reservation),
    });

    expect(trip.passengers).toHaveLength(2);
  });

  it("returns a null nextMilestone, not stale data, when every leg is completed", async () => {
    const completedReservation: SirReservation = {
      ...reservation,
      legs: reservation.legs.map((leg) => ({ ...leg, status: "COMPLETED" })),
    };

    const trip = await getTripOverview(accessLink(), { sirBooking: fakeSirBooking(completedReservation) });

    expect(trip.nextMilestone).toBeNull();
  });

  it("includes a relocation banner alert regardless of push-subscription state", async () => {
    const relocation: SirRelocation = { legRef: "L1", recordedAt: "2026-10-30T12:00:00-05:00" };

    const trip = await getTripOverview(accessLink(), {
      sirBooking: fakeSirBooking(reservation, [relocation]),
    });

    expect(trip.alerts).toHaveLength(1);
    expect(trip.alerts[0]?.type).toBe("RELOCATION");
  });

  it("masks the reservation reference rather than exposing it in full", async () => {
    const trip = await getTripOverview(accessLink(), { sirBooking: fakeSirBooking(reservation) });

    expect(trip.reservationRefMasked).not.toBe("RES-1001");
  });

  it("uses the injected clock for fetchedAt when provided", async () => {
    const now = new Date("2026-10-15T00:00:00.000Z");

    const trip = await getTripOverview(accessLink(), {
      sirBooking: fakeSirBooking(reservation),
      now: () => now,
    });

    expect(trip.fetchedAt).toBe(now.toISOString());
  });

  it("produces output that satisfies the shared TripDTO schema", async () => {
    const trip = await getTripOverview(accessLink(), { sirBooking: fakeSirBooking(reservation) });

    expect(() => TripDTOSchema.parse(trip)).not.toThrow();
  });
});
