import { describe, expect, it } from "vitest";
import { BookingNotFoundError, SirUnavailableError } from "./errors.js";

describe("BookingNotFoundError", () => {
  it("names the missing reservation reference in its message and sets a recognizable name", () => {
    const error = new BookingNotFoundError("RES-9999");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("BookingNotFoundError");
    expect(error.message).toContain("RES-9999");
  });
});

describe("SirUnavailableError", () => {
  it("carries an optional cause into its message when provided", () => {
    const error = new SirUnavailableError("timeout");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("SirUnavailableError");
    expect(error.message).toContain("timeout");
  });

  it("still produces a sensible message when no cause is given", () => {
    const error = new SirUnavailableError();

    expect(error.message.length).toBeGreaterThan(0);
  });
});
