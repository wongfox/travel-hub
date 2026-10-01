import { describe, expect, it } from "vitest";
import { buildStaffAlertPayload } from "./build-staff-alert-payload.js";

const LEG = {
  legRef: "L1",
  origin: "Ollantaytambo",
  destination: "Machu Picchu Pueblo",
  departureLocal: "2026-11-02T08:10:00-05:00",
};

describe("buildStaffAlertPayload", () => {
  it("builds a payload carrying only the D4a minimal fields", () => {
    const payload = buildStaffAlertPayload({
      alertId: "alert-1",
      reservationRef: "RES-1001",
      passengerOrdinal: 1,
      leg: LEG,
      returnLeg: null,
      serviceTier: "PRIME",
      score: 1,
      scaleMax: 5,
      answeredAt: "2026-11-02T08:15:00.000Z",
      passengerLocale: "es",
    });

    expect(payload).toEqual({
      alertId: "alert-1",
      reservationRef: "RES-1001",
      passengerOrdinal: 1,
      leg: { origin: "Ollantaytambo", destination: "Machu Picchu Pueblo", departureLocal: LEG.departureLocal },
      returnLegDepartureLocal: null,
      serviceTier: "PRIME",
      score: 1,
      scaleMax: 5,
      answeredAt: "2026-11-02T08:15:00.000Z",
      passengerLocale: "es",
    });
  });

  it("includes returnLegDepartureLocal when a return leg is given", () => {
    const payload = buildStaffAlertPayload({
      alertId: "alert-1",
      reservationRef: "RES-1001",
      passengerOrdinal: 1,
      leg: LEG,
      returnLeg: { ...LEG, legRef: "L2", departureLocal: "2026-11-05T18:00:00-05:00" },
      serviceTier: "PRIME",
      score: 1,
      scaleMax: 5,
      answeredAt: "2026-11-02T08:15:00.000Z",
      passengerLocale: "es",
    });

    expect(payload.returnLegDepartureLocal).toBe("2026-11-05T18:00:00-05:00");
  });

  it("never carries a passenger name, email, phone, document number, or free text — enforced by the strict StaffAlertPayloadSchema the builder validates against", () => {
    const payload = buildStaffAlertPayload({
      alertId: "alert-1",
      reservationRef: "RES-1001",
      passengerOrdinal: 1,
      leg: LEG,
      returnLeg: null,
      serviceTier: "PRIME",
      score: 1,
      scaleMax: 5,
      answeredAt: "2026-11-02T08:15:00.000Z",
      passengerLocale: "es",
    });

    const fieldNames = Object.keys(payload);
    const forbiddenPatterns = [/name/i, /email/i, /phone/i, /document/i, /free.?text/i];
    for (const field of fieldNames) {
      for (const pattern of forbiddenPatterns) {
        expect(field).not.toMatch(pattern);
      }
    }
  });
});
