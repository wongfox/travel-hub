import { describe, expect, it } from "vitest";
import { selectNextMilestone } from "./select-next-milestone.js";
import type { SirLeg } from "../booking/ports.js";

function leg(overrides: Partial<SirLeg>): SirLeg {
  return {
    legRef: "L1",
    origin: "Ollantaytambo",
    destination: "Machu Picchu Pueblo",
    departureLocal: "2026-11-02T08:10:00-05:00",
    arrivalLocal: "2026-11-02T09:40:00-05:00",
    tier: "PRIME",
    status: "SCHEDULED",
    ...overrides,
  };
}

describe("selectNextMilestone", () => {
  it("returns null when every leg is completed, instead of a stale next milestone", () => {
    const legs = [leg({ legRef: "L1", status: "COMPLETED" }), leg({ legRef: "L2", status: "COMPLETED" })];

    expect(selectNextMilestone(legs)).toBeNull();
  });

  it("returns null for a reservation with no legs", () => {
    expect(selectNextMilestone([])).toBeNull();
  });

  it("selects the earliest non-terminal leg by departure time", () => {
    const legs = [
      leg({ legRef: "later", departureLocal: "2026-11-05T08:00:00-05:00", status: "SCHEDULED" }),
      leg({ legRef: "sooner", departureLocal: "2026-11-02T08:00:00-05:00", status: "SCHEDULED" }),
    ];

    expect(selectNextMilestone(legs)).toEqual({
      legId: "sooner",
      kind: "departure",
      atLocal: "2026-11-02T08:00:00-05:00",
    });
  });

  it("skips completed and cancelled legs when selecting the next milestone", () => {
    const legs = [
      leg({ legRef: "done", departureLocal: "2026-11-01T08:00:00-05:00", status: "COMPLETED" }),
      leg({ legRef: "cancelled", departureLocal: "2026-11-02T08:00:00-05:00", status: "CANCELLED" }),
      leg({ legRef: "upcoming", departureLocal: "2026-11-03T08:00:00-05:00", status: "SCHEDULED" }),
    ];

    expect(selectNextMilestone(legs)?.legId).toBe("upcoming");
  });

  it("treats a relocated leg as still upcoming, not terminal", () => {
    const legs = [leg({ legRef: "relocated", status: "RELOCATED" })];

    expect(selectNextMilestone(legs)?.legId).toBe("relocated");
  });
});
