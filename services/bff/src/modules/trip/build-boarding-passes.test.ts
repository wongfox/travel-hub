import { describe, expect, it } from "vitest";
import { buildBoardingPasses } from "./build-boarding-passes.js";
import type { SirLeg, SirRelocation } from "../booking/ports.js";

function leg(overrides: Partial<SirLeg> = {}): SirLeg {
  return {
    legRef: "L1",
    origin: "Ollantaytambo",
    destination: "Machu Picchu Pueblo",
    departureLocal: "2026-11-02T08:10:00-05:00",
    arrivalLocal: "2026-11-02T09:40:00-05:00",
    tier: "PRIME",
    status: "SCHEDULED",
    seat: "5A",
    coach: "3",
    barcodeFormat: "CODE128",
    barcodePayload: "BP-L1",
    ...overrides,
  };
}

describe("buildBoardingPasses", () => {
  it("builds one boarding pass per leg with the leg's seat, coach, barcode, and resolved tier", () => {
    const passes = buildBoardingPasses([leg()], []);

    expect(passes).toEqual([
      { legId: "L1", barcodeFormat: "CODE128", barcodePayload: "BP-L1", seat: "5A", coach: "3", tier: "PRIME" },
    ]);
  });

  it("overrides the seat with a recorded relocation's newSeat for the matching leg, without a passenger action", () => {
    const relocation: SirRelocation = {
      legRef: "L1",
      recordedAt: "2026-10-30T12:00:00-05:00",
      newSeat: "3C",
    };

    const passes = buildBoardingPasses([leg()], [relocation]);

    expect(passes[0]?.seat).toBe("3C");
    expect(passes[0]?.coach).toBe("3");
  });

  it("leaves the original seat untouched when a relocation exists for a different leg", () => {
    const relocation: SirRelocation = {
      legRef: "L2",
      recordedAt: "2026-10-30T12:00:00-05:00",
      newSeat: "9Z",
    };

    const passes = buildBoardingPasses([leg()], [relocation]);

    expect(passes[0]?.seat).toBe("5A");
  });

  it("leaves the original seat untouched when a relocation for the same leg carries no newSeat", () => {
    const relocation: SirRelocation = { legRef: "L1", recordedAt: "2026-10-30T12:00:00-05:00" };

    const passes = buildBoardingPasses([leg()], [relocation]);

    expect(passes[0]?.seat).toBe("5A");
  });

  it("resolves an unrecognized raw tier to the neutral UNKNOWN fallback instead of throwing", () => {
    const passes = buildBoardingPasses([leg({ tier: "NOT_A_TIER" as never })], []);

    expect(passes[0]?.tier).toBe("UNKNOWN");
  });

  it("returns an empty array for no legs", () => {
    expect(buildBoardingPasses([], [])).toEqual([]);
  });
});
