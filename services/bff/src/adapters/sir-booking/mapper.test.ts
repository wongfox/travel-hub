import { describe, expect, it } from "vitest";
import { parseSeedReservations, mapSeedReservationToDomain, mapSeedRelocationToDomain } from "./mapper.js";

const validSeedReservation = {
  reservationRef: "RES-1001",
  contact: { kind: "email", address: "ana.torres@example.com" },
  passengers: [{ passengerRef: "P1", ordinal: 1, displayName: "Ana Torres" }],
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
  relocations: [],
};

describe("parseSeedReservations", () => {
  it("accepts a well-formed seed reservation array", () => {
    const parsed = parseSeedReservations([validSeedReservation]);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.reservationRef).toBe("RES-1001");
  });

  it("rejects a seed entry with an invalid tier, naming the violation, so a corrupted fixture fails loudly", () => {
    const malformed = { ...validSeedReservation, legs: [{ ...validSeedReservation.legs[0], tier: "NOT_A_TIER" }] };

    expect(() => parseSeedReservations([malformed])).toThrow();
  });

  it("rejects a seed entry missing its reservationRef", () => {
    const malformed: Record<string, unknown> = { ...validSeedReservation };
    delete malformed.reservationRef;

    expect(() => parseSeedReservations([malformed])).toThrow();
  });
});

describe("mapSeedReservationToDomain", () => {
  it("maps a validated seed reservation into the domain SirReservation shape one-to-one", () => {
    const [seed] = parseSeedReservations([validSeedReservation]);
    const domain = mapSeedReservationToDomain(seed!);

    expect(domain).toEqual({
      reservationRef: "RES-1001",
      contact: { kind: "email", address: "ana.torres@example.com" },
      passengers: [{ passengerRef: "P1", ordinal: 1, displayName: "Ana Torres" }],
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
    });
  });
});

describe("mapSeedRelocationToDomain", () => {
  it("maps a seed relocation with every optional field present", () => {
    const domain = mapSeedRelocationToDomain({
      legRef: "L1",
      recordedAt: "2026-10-30T12:00:00-05:00",
      reason: "capacity change",
      newSeat: "3C",
    });

    expect(domain).toEqual({
      legRef: "L1",
      recordedAt: "2026-10-30T12:00:00-05:00",
      reason: "capacity change",
      newSeat: "3C",
    });
  });

  it("omits optional keys entirely (not as literal undefined) when the seed did not provide them", () => {
    const domain = mapSeedRelocationToDomain({ legRef: "L1", recordedAt: "2026-10-30T12:00:00-05:00" });

    expect(domain).toEqual({ legRef: "L1", recordedAt: "2026-10-30T12:00:00-05:00" });
    expect("reason" in domain).toBe(false);
    expect("newSeat" in domain).toBe(false);
  });
});
