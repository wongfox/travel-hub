import { describe, expect, it } from "vitest";
import type { TripDTO } from "contracts";
import { resolveServices } from "./resolve-services.js";

function trip(
  features: Partial<TripDTO["features"]>,
  consentTextVersions?: TripDTO["consentTextVersions"],
): Pick<TripDTO, "features" | "consentTextVersions"> {
  return { features: features as TripDTO["features"], ...(consentTextVersions ? { consentTextVersions } : {}) };
}

const ids = (input: Pick<TripDTO, "features" | "consentTextVersions">) => resolveServices(input).map((s) => s.id);

describe("resolveServices", () => {
  it("always offers help (no flag gates the support channel)", () => {
    expect(ids(trip({}))).toEqual(["help"]);
  });

  it("offers menu, destination and wifi from their own passenger feature flags", () => {
    expect(ids(trip({ menuEnabled: true }))).toEqual(["help", "menu"]);
    expect(ids(trip({ destinationEnabled: true }))).toEqual(["help", "destination"]);
    expect(ids(trip({ wifiCheckout: true }))).toEqual(["help", "wifi"]);
  });

  it("offers notifications only with the push flag AND a published push consent version", () => {
    expect(ids(trip({ pushEnabled: true }))).toEqual(["help"]);
    expect(ids(trip({ pushEnabled: false }, { push: "v1" }))).toEqual(["help"]);
    expect(ids(trip({ pushEnabled: true }, { push: "v1" }))).toEqual(["help", "push"]);
  });

  it("offers the pulse survey only with the capture flag AND a published pulse consent version", () => {
    expect(ids(trip({ pulseCapture: true }))).toEqual(["help"]);
    expect(ids(trip({ pulseCapture: true }, { pulse: "v1" }))).toEqual(["help", "pulse"]);
  });

  it("keeps a stable order and links each service to its route", () => {
    const all = resolveServices(
      trip(
        { menuEnabled: true, destinationEnabled: true, wifiCheckout: true, pushEnabled: true, pulseCapture: true },
        { push: "p1", pulse: "u1" },
      ),
    );

    expect(all.map((s) => [s.id, s.href])).toEqual([
      ["help", "/trip/help"],
      ["menu", "/trip/menu"],
      ["destination", "/trip/destination"],
      ["wifi", "/trip/wifi"],
      ["push", "/trip/push"],
      ["pulse", "/trip/pulse"],
    ]);
  });
});
