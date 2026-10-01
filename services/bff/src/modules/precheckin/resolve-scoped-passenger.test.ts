import { describe, expect, it } from "vitest";
import { resolveScopedPassengerByOrdinal } from "./resolve-scoped-passenger.js";
import { PassengerNotInScopeError } from "./ports.js";
import type { SirPassenger } from "../booking/ports.js";

const passengers: SirPassenger[] = [
  { passengerRef: "P1", ordinal: 1, displayName: "Ana Torres" },
  { passengerRef: "P2", ordinal: 2, displayName: "Luis Torres" },
];

describe("resolveScopedPassengerByOrdinal", () => {
  it("finds the passenger matching the ordinal when the link scopes every passenger", () => {
    const result = resolveScopedPassengerByOrdinal(passengers, [], 2);

    expect(result.passengerRef).toBe("P2");
  });

  it("finds the passenger matching the ordinal when the link scopes a subset", () => {
    const result = resolveScopedPassengerByOrdinal(passengers, ["P1"], 1);

    expect(result.passengerRef).toBe("P1");
  });

  it("throws PassengerNotInScopeError for an ordinal excluded by the link's scope", () => {
    expect(() => resolveScopedPassengerByOrdinal(passengers, ["P1"], 2)).toThrow(PassengerNotInScopeError);
  });

  it("throws PassengerNotInScopeError for an ordinal that does not exist on the reservation at all", () => {
    expect(() => resolveScopedPassengerByOrdinal(passengers, [], 99)).toThrow(PassengerNotInScopeError);
  });
});
