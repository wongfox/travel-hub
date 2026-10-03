import { describe, expect, it } from "vitest";
import { resolveTripOverallTier } from "./resolve-trip-tier.js";
import type { SirLeg } from "../booking/ports.js";

function leg(overrides: Partial<SirLeg>): SirLeg {
  return {
    legRef: "L1",
    origin: "A",
    destination: "B",
    departureLocal: "2026-01-01T00:00:00-05:00",
    arrivalLocal: "2026-01-01T01:00:00-05:00",
    tier: "VOYAGER",
    status: "SCHEDULED",
    seat: "1A",
    coach: "1",
    barcodeFormat: "CODE128",
    barcodePayload: "BP",
    ...overrides,
  };
}

describe("resolveTripOverallTier", () => {
  it("resolves the next milestone leg's tier when a next milestone is given", () => {
    const legs = [leg({ legRef: "L1", tier: "VOYAGER" }), leg({ legRef: "L2", tier: "PRIME" })];

    expect(resolveTripOverallTier(legs, "L2")).toBe("PRIME");
  });

  it("falls back to the first leg's tier when no next milestone is given", () => {
    const legs = [leg({ legRef: "L1", tier: "FIRST_CLASS" }), leg({ legRef: "L2", tier: "PRIME" })];

    expect(resolveTripOverallTier(legs, null)).toBe("FIRST_CLASS");
  });

  it("falls back to the first leg's tier when the next milestone's legRef is not found among the legs", () => {
    const legs = [leg({ legRef: "L1", tier: "VISTADOME_360" })];

    expect(resolveTripOverallTier(legs, "L-unknown")).toBe("VISTADOME_360");
  });

  it("resolves to UNKNOWN when there are no legs at all", () => {
    expect(resolveTripOverallTier([], null)).toBe("UNKNOWN");
  });

  it("resolves a raw/unrecognized tier value via resolveServiceTier's neutral fallback", () => {
    const legs = [leg({ legRef: "L1", tier: "SOMETHING_UNEXPECTED" as never })];

    expect(resolveTripOverallTier(legs, null)).toBe("UNKNOWN");
  });
});
