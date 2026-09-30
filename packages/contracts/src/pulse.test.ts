import { describe, expect, it } from "vitest";
import { StaffAlertPayloadSchema, SubmitPulseRequestSchema } from "./pulse.js";

const validStaffAlertPayload = {
  alertId: "alert_01",
  reservationRef: "RES-001",
  passengerOrdinal: 1,
  leg: {
    origin: "Ollantaytambo",
    destination: "Aguas Calientes",
    departureLocal: "2026-10-01T08:00:00",
  },
  returnLegDepartureLocal: "2026-10-04T18:00:00",
  serviceTier: "PRIME",
  score: 1,
  scaleMax: 5,
  answeredAt: "2026-10-01T08:15:00.000Z",
  passengerLocale: "es",
};

describe("SubmitPulseRequestSchema", () => {
  it("accepts a `POST /api/pulse` request with a leg and a score", () => {
    const body = { legId: "leg_01", score: 2 };
    expect(SubmitPulseRequestSchema.parse(body)).toEqual(body);
  });

  it("rejects a score outside the faces-scale range", () => {
    expect(() => SubmitPulseRequestSchema.parse({ legId: "leg_01", score: 9 })).toThrow();
  });
});

describe("StaffAlertPayloadSchema", () => {
  it("round-trips the full D4a minimal payload shape from design-interfaces", () => {
    expect(StaffAlertPayloadSchema.parse(validStaffAlertPayload)).toEqual(
      validStaffAlertPayload,
    );
  });

  it("accepts a payload with no return leg (one-way trip)", () => {
    const oneWay = { ...validStaffAlertPayload, returnLegDepartureLocal: null };
    const parsed = StaffAlertPayloadSchema.parse(oneWay);
    expect(parsed.returnLegDepartureLocal).toBeNull();
  });

  it("has no field named after passenger name, email, phone, or document number", () => {
    const fieldNames = Object.keys(StaffAlertPayloadSchema.shape);
    const forbiddenPatterns = [/name/i, /email/i, /phone/i, /document/i, /free.?text/i];

    for (const field of fieldNames) {
      for (const pattern of forbiddenPatterns) {
        expect(field).not.toMatch(pattern);
      }
    }
  });

  it("rejects any payload carrying an extra field beyond the defined minimal set (D4a no-scope-creep)", () => {
    expect(() =>
      StaffAlertPayloadSchema.parse({
        ...validStaffAlertPayload,
        passengerName: "Jane Doe",
      }),
    ).toThrow();

    expect(() =>
      StaffAlertPayloadSchema.parse({
        ...validStaffAlertPayload,
        passengerEmail: "jane@example.com",
      }),
    ).toThrow();

    expect(() =>
      StaffAlertPayloadSchema.parse({
        ...validStaffAlertPayload,
        freeTextNote: "the passenger complained about the seat",
      }),
    ).toThrow();
  });
});
