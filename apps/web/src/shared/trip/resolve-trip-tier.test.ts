import { describe, expect, it } from "vitest";
import type { NextMilestone, TripLeg } from "contracts";
import { resolveTripTier } from "./resolve-trip-tier.js";

function buildLeg(overrides: Partial<TripLeg>): TripLeg {
  return {
    id: "leg-1",
    origin: "Poroy",
    destination: "Machu Picchu",
    departureLocal: "2026-11-10T08:00:00",
    arrivalLocal: "2026-11-10T11:30:00",
    tier: "VOYAGER",
    status: "SCHEDULED",
    ...overrides,
  };
}

describe("resolveTripTier", () => {
  it("resolves the tier of the leg matching the next milestone", () => {
    const legs = [buildLeg({ id: "leg-1", tier: "VOYAGER" }), buildLeg({ id: "leg-2", tier: "PRIME" })];
    const nextMilestone: NextMilestone = { legId: "leg-2", kind: "departure", atLocal: "2026-11-11T08:00:00" };

    expect(resolveTripTier(legs, nextMilestone)).toBe("PRIME");
  });

  it("falls back to the first leg's tier when the next milestone's leg cannot be found", () => {
    const legs = [buildLeg({ id: "leg-1", tier: "FIRST_CLASS" })];
    const nextMilestone: NextMilestone = { legId: "unknown-leg", kind: "departure", atLocal: "2026-11-11T08:00:00" };

    expect(resolveTripTier(legs, nextMilestone)).toBe("FIRST_CLASS");
  });

  it("falls back to the first leg's tier when there is no next milestone", () => {
    const legs = [buildLeg({ id: "leg-1", tier: "VISTADOME_360" })];

    expect(resolveTripTier(legs, null)).toBe("VISTADOME_360");
  });

  it("resolves UNKNOWN when there are no legs at all", () => {
    expect(resolveTripTier([], null)).toBe("UNKNOWN");
  });
});
