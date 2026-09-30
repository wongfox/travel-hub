import { describe, expect, it } from "vitest";
import type { TripDTO } from "contracts";
import { toTripSnapshot } from "./to-trip-snapshot.js";

const baseTrip: TripDTO = {
  linkId: "link-1",
  reservationRefMasked: "RES***42",
  expiresAt: "2026-10-02T12:00:00Z",
  passengers: [{ ordinal: 1, displayName: "A. Traveler", precheckinStatus: "none" }],
  legs: [
    {
      id: "leg-1",
      origin: "OLL",
      destination: "AGU",
      departureLocal: "2026-10-01T08:00:00-05:00",
      arrivalLocal: "2026-10-01T09:30:00-05:00",
      tier: "VOYAGER",
      status: "SCHEDULED",
    },
  ],
  boardingPasses: [
    { legId: "leg-1", barcodeFormat: "QR", barcodePayload: "payload-1", seat: "12A", coach: "C", tier: "VOYAGER" },
  ],
  documents: [
    { id: "doc-1", kind: "TRAIN", title: "Train ticket", milestoneId: "leg-1", barcodePayload: "payload-1" },
    { id: "doc-2", kind: "INC_ENTRY", title: "Entry ticket", milestoneId: null, fileId: "file-2" },
  ],
  alerts: [
    { id: "alert-1", type: "RELOCATION", legId: "leg-1", titleKey: "alerts.relocation.title", bodyKey: "alerts.relocation.body", occurredAt: "2026-09-30T10:00:00Z" },
  ],
  nextMilestone: { legId: "leg-1", kind: "departure", atLocal: "2026-10-01T08:00:00-05:00" },
  features: {
    precheckinCaptureUi: false,
    pushEnabled: false,
    pushA2hsPrompt: false,
    pulseCapture: false,
    wifiCheckout: false,
    menuEnabled: false,
    destinationEnabled: false,
    tierTheming: true,
    offlineContent: false,
  },
  fetchedAt: "2026-09-30T12:00:00Z",
};

describe("toTripSnapshot", () => {
  it("maps a TripDTO into the narrower offline TripSnapshot shape", () => {
    const snapshot = toTripSnapshot(baseTrip);

    expect(snapshot).toEqual({
      schemaVersion: 1,
      reservationRefMasked: "RES***42",
      passengers: [{ ordinal: 1, displayName: "A. Traveler" }],
      legs: baseTrip.legs,
      boardingPasses: baseTrip.boardingPasses,
      tickets: [
        { kind: "TRAIN", title: "Train ticket", barcodePayload: "payload-1" },
        { kind: "INC_ENTRY", title: "Entry ticket", fileId: "file-2" },
      ],
      alerts: baseTrip.alerts,
      fetchedAt: "2026-09-30T12:00:00Z",
      expiresAt: "2026-10-02T12:00:00Z",
    });
  });

  it("drops precheckinStatus and never carries it into the offline snapshot (no sensitive data offline)", () => {
    const snapshot = toTripSnapshot(baseTrip);

    expect(snapshot.passengers[0]).not.toHaveProperty("precheckinStatus");
  });

  it("omits barcodePayload/fileId on a ticket that has neither, instead of writing them as undefined", () => {
    const noExtras: TripDTO = {
      ...baseTrip,
      documents: [{ id: "doc-3", kind: "MEAL_TEATIME", title: "Tea time", milestoneId: null }],
    };

    const snapshot = toTripSnapshot(noExtras);

    expect(snapshot.tickets).toEqual([{ kind: "MEAL_TEATIME", title: "Tea time" }]);
    expect(Object.keys(snapshot.tickets[0]!)).not.toContain("barcodePayload");
    expect(Object.keys(snapshot.tickets[0]!)).not.toContain("fileId");
  });
});
