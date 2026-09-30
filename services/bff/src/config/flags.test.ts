import { describe, expect, it } from "vitest";
import { FLAG_DEFAULTS, resolveFlags } from "./flags.js";

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
