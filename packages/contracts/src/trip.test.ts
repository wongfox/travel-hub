import { describe, expect, it } from "vitest";
import {
  AlertDTOSchema,
  BoardingPassDTOSchema,
  PassengerFeatureKeySchema,
  TicketDTOSchema,
  TripDTOSchema,
} from "./trip.js";

const fullFeatureSet = {
  precheckinCaptureUi: true,
  pushEnabled: true,
  pushA2hsPrompt: false,
  pulseCapture: true,
  wifiCheckout: false,
  menuEnabled: true,
  destinationEnabled: true,
  tierTheming: true,
  offlineContent: false,
};

function buildTripFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    linkId: "link_01",
    reservationRefMasked: "RES***42",
    expiresAt: "2026-10-05T00:00:00.000Z",
    passengers: [
      { ordinal: 1, displayName: "Jane D.", precheckinStatus: "received" },
    ],
    legs: [
      {
        id: "leg_01",
        origin: "Ollantaytambo",
        destination: "Aguas Calientes",
        departureLocal: "2026-10-01T08:00:00",
        arrivalLocal: "2026-10-01T09:30:00",
        tier: "PRIME",
        status: "SCHEDULED",
      },
    ],
    boardingPasses: [
      {
        legId: "leg_01",
        barcodeFormat: "QR",
        barcodePayload: "payload-abc",
        seat: "12A",
        coach: "C",
        tier: "PRIME",
      },
    ],
    documents: [
      { id: "doc_01", kind: "TRAIN", title: "Train boarding pass", milestoneId: "leg_01" },
    ],
    alerts: [],
    nextMilestone: { legId: "leg_01", kind: "DEPARTURE", atLocal: "2026-10-01T08:00:00" },
    features: fullFeatureSet,
    fetchedAt: "2026-09-30T12:00:00.000Z",
    ...overrides,
  };
}

describe("TripDTOSchema", () => {
  it("round-trips a full fixture matching the design-interfaces TripDTO shape", () => {
    const fixture = buildTripFixture();

    expect(TripDTOSchema.parse(fixture)).toEqual(fixture);
  });

  it("round-trips a second fixture with a different tier, status, and no next milestone", () => {
    const fixture = buildTripFixture({
      legs: [
        {
          id: "leg_02",
          origin: "Aguas Calientes",
          destination: "Cusco",
          departureLocal: "2026-10-04T18:00:00",
          arrivalLocal: "2026-10-04T21:00:00",
          tier: "UNKNOWN",
          status: "COMPLETED",
        },
      ],
      nextMilestone: null,
    });

    const parsed = TripDTOSchema.parse(fixture);

    expect(parsed.nextMilestone).toBeNull();
    expect(parsed.legs[0]?.status).toBe("COMPLETED");
  });

  it("rejects a features object missing a declared passenger feature key", () => {
    const fixture = buildTripFixture({
      features: { ...fullFeatureSet, offlineContent: undefined },
    });

    expect(() => TripDTOSchema.parse(fixture)).toThrow();
  });
});

describe("BoardingPassDTOSchema", () => {
  it("accepts a boarding pass matching the client-side snapshot shape", () => {
    const boardingPass = {
      legId: "leg_01",
      barcodeFormat: "QR",
      barcodePayload: "payload-abc",
      seat: "12A",
      coach: "C",
      tier: "PRIME",
    };

    expect(BoardingPassDTOSchema.parse(boardingPass)).toEqual(boardingPass);
  });

  it("rejects a boarding pass with an unresolved tier value", () => {
    expect(() =>
      BoardingPassDTOSchema.parse({
        legId: "leg_01",
        barcodeFormat: "QR",
        barcodePayload: "payload-abc",
        seat: "12A",
        coach: "C",
        tier: "GOLD",
      }),
    ).toThrow();
  });
});

describe("TicketDTOSchema", () => {
  it("accepts every ticket kind named in travel-documents (train, Consettur, INC entry, meal/tea-time)", () => {
    for (const kind of ["TRAIN", "CONSETTUR", "INC_ENTRY", "MEAL_TEATIME"] as const) {
      const ticket = { id: `doc_${kind}`, kind, title: `Ticket ${kind}`, milestoneId: "leg_01" };
      expect(TicketDTOSchema.parse(ticket)).toEqual(ticket);
    }
  });

  it("allows milestoneId to be null for a ticket with no itinerary association yet", () => {
    const ticket = { id: "doc_x", kind: "OTHER", title: "Misc", milestoneId: null };
    expect(TicketDTOSchema.parse(ticket)).toEqual(ticket);
  });
});

describe("AlertDTOSchema", () => {
  it("accepts a relocation alert scoped to one leg", () => {
    const alert = {
      id: "alert_01",
      type: "RELOCATION",
      legId: "leg_01",
      titleKey: "alerts.relocation.title",
      bodyKey: "alerts.relocation.body",
      occurredAt: "2026-10-01T07:00:00.000Z",
    };

    expect(AlertDTOSchema.parse(alert)).toEqual(alert);
  });

  it("rejects an alert type outside DELAY, RELOCATION, INCIDENT", () => {
    expect(() =>
      AlertDTOSchema.parse({
        id: "alert_02",
        type: "PROMOTIONAL",
        legId: null,
        titleKey: "x",
        bodyKey: "y",
        occurredAt: "2026-10-01T07:00:00.000Z",
      }),
    ).toThrow();
  });
});

describe("PassengerFeatureKeySchema", () => {
  it("accepts every passenger-visible flag derived from design Decision 13", () => {
    for (const key of Object.keys(fullFeatureSet)) {
      expect(PassengerFeatureKeySchema.parse(key)).toBe(key);
    }
  });
});
