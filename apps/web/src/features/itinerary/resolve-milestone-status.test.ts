import { describe, expect, it } from "vitest";
import type { TripLeg } from "contracts";
import { resolveMilestoneStatus } from "./resolve-milestone-status.js";

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

const NOW = new Date("2026-11-10T09:00:00Z");

describe("resolveMilestoneStatus", () => {
  it("is completed for a leg the BFF already marked COMPLETED", () => {
    const leg = buildLeg({ status: "COMPLETED" });

    expect(resolveMilestoneStatus(leg, null, NOW)).toBe("completed");
  });

  it("is completed for a CANCELLED leg (terminal, not part of the 4-state itinerary vocabulary)", () => {
    const leg = buildLeg({ status: "CANCELLED" });

    expect(resolveMilestoneStatus(leg, null, NOW)).toBe("completed");
  });

  it("is next when the leg id matches the trip's next milestone", () => {
    const leg = buildLeg({ id: "leg-2", status: "SCHEDULED", departureLocal: "2026-11-12T08:00:00" });

    expect(resolveMilestoneStatus(leg, "leg-2", NOW)).toBe("next");
  });

  it("is in progress when departure has already passed but the leg is not the next milestone or completed", () => {
    const leg = buildLeg({ status: "DELAYED", departureLocal: "2026-11-10T08:00:00" });

    expect(resolveMilestoneStatus(leg, null, NOW)).toBe("in_progress");
  });

  it("is pending when departure is still in the future and the leg is not the next milestone", () => {
    const leg = buildLeg({ status: "SCHEDULED", departureLocal: "2026-11-12T08:00:00" });

    expect(resolveMilestoneStatus(leg, "some-other-leg", NOW)).toBe("pending");
  });

  it("handles a departure carrying a numeric UTC offset, as the seeded SIR data does", () => {
    const past = buildLeg({ status: "DELAYED", departureLocal: "2026-11-10T08:00:00-05:00" });
    const future = buildLeg({ status: "SCHEDULED", departureLocal: "2026-11-12T08:00:00-05:00" });

    expect(resolveMilestoneStatus(past, null, NOW)).toBe("in_progress");
    expect(resolveMilestoneStatus(future, null, NOW)).toBe("pending");
  });
});
