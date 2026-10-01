import { describe, expect, it } from "vitest";
import type { TripLeg } from "contracts";
import { resolvePulseTriggerLeg } from "./resolve-pulse-trigger-leg.js";

function leg(overrides: Partial<TripLeg>): TripLeg {
  return {
    id: "L1",
    origin: "Ollantaytambo",
    destination: "Machu Picchu Pueblo",
    departureLocal: "2026-11-02T08:10:00-05:00",
    arrivalLocal: "2026-11-02T09:40:00-05:00",
    tier: "PRIME",
    status: "SCHEDULED",
    ...overrides,
  };
}

describe("resolvePulseTriggerLeg", () => {
  it("returns null when no leg has completed yet (narrow, documented trigger-moment choice: the pulse prompt moment is a completed leg)", () => {
    expect(resolvePulseTriggerLeg([leg({ status: "SCHEDULED" }), leg({ id: "L2", status: "DELAYED" })])).toBeNull();
  });

  it("returns the first completed leg", () => {
    const completed = leg({ id: "L1", status: "COMPLETED" });
    expect(resolvePulseTriggerLeg([completed, leg({ id: "L2", status: "SCHEDULED" })])).toEqual(completed);
  });

  it("returns null for an empty leg list", () => {
    expect(resolvePulseTriggerLeg([])).toBeNull();
  });
});
