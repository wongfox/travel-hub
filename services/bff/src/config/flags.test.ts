import { describe, expect, it } from "vitest";
import { FLAG_DEFAULTS, resolveFlags, resolvePassengerFeatures } from "./flags.js";

describe("FLAG_DEFAULTS", () => {
  it("defaults links.issuance to on, matching design Decision 13's production defaults", () => {
    expect(FLAG_DEFAULTS["links.issuance"]).toBe(true);
  });

  it("defaults every guarded off-by-default flag to false", () => {
    expect(FLAG_DEFAULTS["precheckin.capture_ui"]).toBe(false);
    expect(FLAG_DEFAULTS["precheckin.production_collection"]).toBe(false);
    expect(FLAG_DEFAULTS["push.enabled"]).toBe(false);
    expect(FLAG_DEFAULTS["pulse.staff_alerts"]).toBe(false);
    expect(FLAG_DEFAULTS["wifi.checkout"]).toBe(false);
  });
});

describe("resolveFlags", () => {
  it("returns the full default table when no overrides are given", () => {
    const flags = resolveFlags();

    expect(flags).toEqual(FLAG_DEFAULTS);
  });

  it("applies a runtime override on top of the defaults without touching other flags", () => {
    const flags = resolveFlags({ "wifi.checkout": true });

    expect(flags["wifi.checkout"]).toBe(true);
    expect(flags["push.enabled"]).toBe(FLAG_DEFAULTS["push.enabled"]);
    expect(flags["links.issuance"]).toBe(FLAG_DEFAULTS["links.issuance"]);
  });
});

describe("resolvePassengerFeatures", () => {
  it("maps every PassengerFeatureKey from the internal flag table", () => {
    const flags = resolveFlags({ "wifi.checkout": true, "push.enabled": true });

    const features = resolvePassengerFeatures(flags);

    expect(features).toEqual({
      precheckinCaptureUi: false,
      pushEnabled: true,
      pushA2hsPrompt: false,
      pulseCapture: false,
      wifiCheckout: true,
      menuEnabled: false,
      destinationEnabled: false,
      tierTheming: false,
      offlineContent: false,
    });
  });

  it("never exposes a server-only flag key that has no PassengerFeatureKey counterpart", () => {
    const features = resolvePassengerFeatures(resolveFlags());

    expect(features).not.toHaveProperty("links.issuance");
    expect(features).not.toHaveProperty("precheckin.production_collection");
    expect(features).not.toHaveProperty("pulse.staff_alerts");
  });
});
