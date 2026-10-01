import { describe, expect, it } from "vitest";
import { createSirPollingJourneyEventAdapter } from "./sir-polling.js";
import type { AccessLinkRecord, AccessLinkStore } from "../../modules/trip-access/access-link-store.js";
import type { SirBookingPort, SirRelocation, SirReservation } from "../../modules/booking/ports.js";

function buildAccessLinkStore(records: Partial<AccessLinkRecord>[]): Pick<AccessLinkStore, "listActive"> {
  return {
    async listActive() {
      return records.map((record) => ({
        id: "link-id",
        tokenHash: "hash",
        reservationRef: "RES-UNSET",
        passengerScope: [],
        issuedAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2099-01-01T00:00:00.000Z",
        revokedAt: null,
        supersededBy: null,
        issueChannel: "email",
        ...record,
      }));
    },
  };
}

function buildReservation(overrides: Partial<SirReservation> = {}): SirReservation {
  return {
    reservationRef: "RES-1001",
    passengers: [],
    legs: [
      {
        legRef: "L1",
        origin: "Ollantaytambo",
        destination: "Machu Picchu Pueblo",
        departureLocal: "2026-11-02T08:10:00-05:00",
        arrivalLocal: "2026-11-02T09:40:00-05:00",
        tier: "PRIME",
        status: "RELOCATED",
        seat: "5A",
        coach: "3",
        barcodeFormat: "CODE128",
        barcodePayload: "BP-1",
      },
    ],
    contact: { kind: "email", address: "ana@example.com" },
    tickets: [],
    ...overrides,
  };
}

function buildSirBooking(
  reservationsByRef: Record<string, SirReservation>,
  relocationsByRef: Record<string, SirRelocation[]>,
): Pick<SirBookingPort, "getReservation" | "getRelocations"> {
  return {
    async getReservation(ref) {
      const reservation = reservationsByRef[ref.reservationRef];
      if (!reservation) throw new Error(`no reservation ${ref.reservationRef}`);
      return reservation;
    },
    async getRelocations(ref) {
      return relocationsByRef[ref.reservationRef] ?? [];
    },
  };
}

describe("createSirPollingJourneyEventAdapter", () => {
  it("maps a relocation on a leg departing within the window into a RELOCATION JourneyEvent", async () => {
    const accessLinkStore = buildAccessLinkStore([{ reservationRef: "RES-1001" }]);
    const sirBooking = buildSirBooking(
      { "RES-1001": buildReservation() },
      {
        "RES-1001": [{ legRef: "L1", recordedAt: "2026-10-30T12:00:00.000Z", reason: "capacity change", newSeat: "3C" }],
      },
    );
    const adapter = createSirPollingJourneyEventAdapter({ accessLinkStore, sirBooking });

    const events = await adapter.pollActive({
      from: new Date("2026-11-01T00:00:00Z"),
      to: new Date("2026-11-04T00:00:00Z"),
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      reservationRef: "RES-1001",
      legRef: "L1",
      type: "RELOCATION",
      sourceEventId: "L1:2026-10-30T12:00:00.000Z",
    });
  });

  it("excludes a relocation whose leg departs outside the polling window", async () => {
    const accessLinkStore = buildAccessLinkStore([{ reservationRef: "RES-1001" }]);
    const sirBooking = buildSirBooking(
      { "RES-1001": buildReservation() }, // departs 2026-11-02
      { "RES-1001": [{ legRef: "L1", recordedAt: "2026-10-30T12:00:00.000Z" }] },
    );
    const adapter = createSirPollingJourneyEventAdapter({ accessLinkStore, sirBooking });

    const events = await adapter.pollActive({
      from: new Date("2026-12-01T00:00:00Z"),
      to: new Date("2026-12-04T00:00:00Z"),
    });

    expect(events).toHaveLength(0);
  });

  it("polls only reservations with an active access link, not every reservation SIR knows about", async () => {
    const accessLinkStore = buildAccessLinkStore([{ reservationRef: "RES-1001" }]);
    const sirBooking = buildSirBooking(
      { "RES-1001": buildReservation(), "RES-9999": buildReservation({ reservationRef: "RES-9999" }) },
      {
        "RES-1001": [{ legRef: "L1", recordedAt: "2026-10-30T12:00:00.000Z" }],
        "RES-9999": [{ legRef: "L1", recordedAt: "2026-10-30T12:00:00.000Z" }],
      },
    );
    const adapter = createSirPollingJourneyEventAdapter({ accessLinkStore, sirBooking });

    const events = await adapter.pollActive({
      from: new Date("2026-11-01T00:00:00Z"),
      to: new Date("2026-11-04T00:00:00Z"),
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.reservationRef).toBe("RES-1001");
  });

  it("deduplicates reservations seen through more than one active link", async () => {
    const accessLinkStore = buildAccessLinkStore([{ reservationRef: "RES-1001" }, { reservationRef: "RES-1001" }]);
    const sirBooking = buildSirBooking(
      { "RES-1001": buildReservation() },
      { "RES-1001": [{ legRef: "L1", recordedAt: "2026-10-30T12:00:00.000Z" }] },
    );
    const adapter = createSirPollingJourneyEventAdapter({ accessLinkStore, sirBooking });

    const events = await adapter.pollActive({
      from: new Date("2026-11-01T00:00:00Z"),
      to: new Date("2026-11-04T00:00:00Z"),
    });

    expect(events).toHaveLength(1);
  });

  it("returns no events for a reservation with no relocations", async () => {
    const accessLinkStore = buildAccessLinkStore([{ reservationRef: "RES-1001" }]);
    const sirBooking = buildSirBooking({ "RES-1001": buildReservation() }, { "RES-1001": [] });
    const adapter = createSirPollingJourneyEventAdapter({ accessLinkStore, sirBooking });

    const events = await adapter.pollActive({
      from: new Date("2026-11-01T00:00:00Z"),
      to: new Date("2026-11-04T00:00:00Z"),
    });

    expect(events).toHaveLength(0);
  });
});
