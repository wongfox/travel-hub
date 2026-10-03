import { describe, expect, it } from "vitest";
import { maskReservationRef } from "./mask-reservation-ref.js";

describe("maskReservationRef", () => {
  it("keeps the last 4 characters visible and masks the rest", () => {
    expect(maskReservationRef("RES-1001")).toBe("****1001");
  });

  it("masks a reference shorter than the visible window entirely", () => {
    expect(maskReservationRef("AB")).toBe("**");
  });

  it("is deterministic for the same input", () => {
    expect(maskReservationRef("RES-2002")).toBe(maskReservationRef("RES-2002"));
  });

  it("masks every character except the last 4 for a reference longer than 8 characters", () => {
    expect(maskReservationRef("RESERVATION-12345")).toBe("*************2345");
  });

  it("never returns the original reference unchanged for an identifiable reference", () => {
    const ref = "RES-1001";
    expect(maskReservationRef(ref)).not.toBe(ref);
  });
});
