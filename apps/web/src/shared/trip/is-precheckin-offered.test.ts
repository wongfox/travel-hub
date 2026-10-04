import { describe, expect, it } from "vitest";
import type { TripDTO } from "contracts";
import { isPrecheckinOffered } from "./is-precheckin-offered.js";

function trip(overrides: Pick<TripDTO, "features"> & Partial<Pick<TripDTO, "consentTextVersions">>) {
  return overrides;
}

describe("isPrecheckinOffered", () => {
  it("is true only when the capture UI flag is on and a consent text version is published", () => {
    expect(
      isPrecheckinOffered(
        trip({ features: { precheckinCaptureUi: true } as TripDTO["features"], consentTextVersions: { precheckin: "v1" } }),
      ),
    ).toBe(true);
  });

  it("is false when the flag is off", () => {
    expect(
      isPrecheckinOffered(
        trip({ features: { precheckinCaptureUi: false } as TripDTO["features"], consentTextVersions: { precheckin: "v1" } }),
      ),
    ).toBe(false);
  });

  it("is false when no consent text version is published", () => {
    expect(isPrecheckinOffered(trip({ features: { precheckinCaptureUi: true } as TripDTO["features"] }))).toBe(false);
  });
});
