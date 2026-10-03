import { describe, expect, it } from "vitest";
import type { TripLeg } from "contracts";
import { resolveTripStatus } from "./resolve-trip-status.js";

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

describe("resolveTripStatus", () => {
  it("is completed when there is no next milestone, regardless of individual leg statuses", () => {
    const legs = [buildLeg({ status: "COMPLETED" })];

    expect(resolveTripStatus(legs, false)).toBe("completed");
  });

  it("is upcoming when every leg is still scheduled and a next milestone exists", () => {
    const legs = [buildLeg({ status: "SCHEDULED" }), buildLeg({ id: "leg-2", status: "SCHEDULED" })];

    expect(resolveTripStatus(legs, true)).toBe("upcoming");
  });

  it("is in progress when at least one leg has moved beyond scheduled while a next milestone exists", () => {
    const legs = [buildLeg({ status: "COMPLETED" }), buildLeg({ id: "leg-2", status: "SCHEDULED" })];

    expect(resolveTripStatus(legs, true)).toBe("in_progress");
  });

  it("is in progress for a delayed leg with a next milestone", () => {
    const legs = [buildLeg({ status: "DELAYED" })];

    expect(resolveTripStatus(legs, true)).toBe("in_progress");
  });
});
