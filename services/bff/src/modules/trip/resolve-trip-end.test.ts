import { describe, expect, it } from "vitest";
import { resolveTripEndLocal } from "./resolve-trip-end.js";
import type { SirLeg } from "../booking/ports.js";

function leg(overrides: Partial<SirLeg> = {}): SirLeg {
  return {
    legRef: "L1",
    origin: "Ollantaytambo",
    destination: "Machu Picchu",
    departureLocal: "2026-01-01T08:00:00.000Z",
    arrivalLocal: "2026-01-01T10:00:00.000Z",
    tier: "VOYAGER",
    status: "SCHEDULED",
    seat: "1A",
    coach: "1",
    barcodeFormat: "CODE128",
    barcodePayload: "BP-1",
    ...overrides,
  };
}

describe("resolveTripEndLocal", () => {
  it("returns the single leg's arrival when there is exactly one leg", () => {
    expect(resolveTripEndLocal([leg({ arrivalLocal: "2026-01-01T10:00:00.000Z" })])).toBe(
      "2026-01-01T10:00:00.000Z",
    );
  });

  it("returns the latest arrival across multiple legs (round trip), regardless of array order", () => {
    const legs = [
      leg({ legRef: "L1", arrivalLocal: "2026-01-01T10:00:00.000Z" }),
      leg({ legRef: "L2", arrivalLocal: "2026-01-05T18:00:00.000Z" }), // return leg, later
    ];

    expect(resolveTripEndLocal(legs)).toBe("2026-01-05T18:00:00.000Z");
    expect(resolveTripEndLocal([...legs].reverse())).toBe("2026-01-05T18:00:00.000Z");
  });

  it("falls back to the injected clock when there are no legs, instead of throwing", () => {
    const now = () => new Date("2026-02-01T00:00:00.000Z");

    expect(resolveTripEndLocal([], now)).toBe("2026-02-01T00:00:00.000Z");
  });
});
