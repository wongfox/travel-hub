import { describe, expect, it } from "vitest";
import { TripDTOSchema } from "contracts";
import { getTripOverview } from "./get-trip-overview.js";
import type { AccessLinkRecord } from "../trip-access/access-link-store.js";
import type { SirBookingPort, SirReservation, SirRelocation } from "../booking/ports.js";
import { createInMemorySubmissionStore } from "../precheckin/submission-store.js";

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
      seat: "5A",
      coach: "3",
      barcodeFormat: "CODE128",
      barcodePayload: "BP-L1",
    },
  ],
  tickets: [
    { ticketRef: "TCK-INC", kind: "INC_ENTRY", title: "INC entry ticket", milestoneLegRef: "L1", barcodePayload: "INC-1" },
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

  it("populates boardingPasses with one entry per leg (trip-itinerary, task 6.3)", async () => {
    const trip = await getTripOverview(accessLink(), { sirBooking: fakeSirBooking(reservation) });

    expect(trip.boardingPasses).toEqual([
      { legId: "L1", barcodeFormat: "CODE128", barcodePayload: "BP-L1", seat: "5A", coach: "3", tier: "PRIME" },
    ]);
  });

  it("reflects a relocation's updated seat in the boarding pass automatically, consistent with the same relocation's alert", async () => {
    const relocation: SirRelocation = { legRef: "L1", recordedAt: "2026-10-30T12:00:00-05:00", newSeat: "3C" };

    const trip = await getTripOverview(accessLink(), {
      sirBooking: fakeSirBooking(reservation, [relocation]),
    });

    expect(trip.boardingPasses[0]?.seat).toBe("3C");
    expect(trip.alerts).toHaveLength(1);
  });

  it("populates documents with the derived train ticket plus every purchased ancillary ticket (travel-documents, task 6.4)", async () => {
    const trip = await getTripOverview(accessLink(), { sirBooking: fakeSirBooking(reservation) });

    expect(trip.documents).toHaveLength(2);
    const kinds = trip.documents.map((doc) => doc.kind).sort();
    expect(kinds).toEqual(["INC_ENTRY", "TRAIN"]);
    const incTicket = trip.documents.find((doc) => doc.kind === "INC_ENTRY");
    expect(incTicket).toMatchObject({ milestoneId: "L1", barcodePayload: "INC-1" });
  });

  it("defaults every passenger's precheckinStatus to \"none\" when no precheckin store is wired", async () => {
    const trip = await getTripOverview(accessLink(), { sirBooking: fakeSirBooking(reservation) });

    expect(trip.passengers.map((p) => p.precheckinStatus)).toEqual(["none", "none"]);
  });

  it("reflects a real per-passenger precheckin completion status when the store is wired (task 8.4)", async () => {
    const submissionStore = createInMemorySubmissionStore();
    await submissionStore.create({
      reservationRef: "RES-1001",
      passengerRef: "P1",
      docType: "DNI",
      consentRecordId: "consent-1",
      photo: { objectKey: "k1", wrappedDataKey: Buffer.from("a"), iv: Buffer.from("b"), authTag: Buffer.from("c") },
      idFront: { objectKey: "k2", wrappedDataKey: Buffer.from("a"), iv: Buffer.from("b"), authTag: Buffer.from("c") },
      idBack: null,
    });

    const trip = await getTripOverview(accessLink(), {
      sirBooking: fakeSirBooking(reservation),
      precheckinSubmissionStore: submissionStore,
    });

    const p1 = trip.passengers.find((p) => p.displayName === "Ana Torres");
    const p2 = trip.passengers.find((p) => p.displayName === "Luis Torres");
    expect(p1?.precheckinStatus).toBe("received");
    expect(p2?.precheckinStatus).toBe("none");
  });
});
