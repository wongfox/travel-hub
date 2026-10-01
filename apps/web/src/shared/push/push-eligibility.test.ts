import { describe, expect, it } from "vitest";
import { resolvePushEligibility } from "./push-eligibility.js";

describe("resolvePushEligibility", () => {
  it("returns 'ineligible' when the browser has no PushManager support at all (task 11.3 acceptance: an ineligible-browser fixture shows no push opt-in option)", () => {
    expect(
      resolvePushEligibility({ hasPushManager: false, isIosDevice: false, isStandalone: false }),
    ).toBe("ineligible");
  });

  it("returns 'ineligible' for an iOS device with no PushManager support, regardless of standalone mode", () => {
    expect(
      resolvePushEligibility({ hasPushManager: false, isIosDevice: true, isStandalone: true }),
    ).toBe("ineligible");
  });

  it("returns 'needs_a2hs' for an iOS device with PushManager support but not running standalone", () => {
    expect(
      resolvePushEligibility({ hasPushManager: true, isIosDevice: true, isStandalone: false }),
    ).toBe("needs_a2hs");
  });

  it("returns 'eligible' for an iOS device with PushManager support running standalone", () => {
    expect(
      resolvePushEligibility({ hasPushManager: true, isIosDevice: true, isStandalone: true }),
    ).toBe("eligible");
  });

  it("returns 'eligible' for a non-iOS device with PushManager support, standalone or not", () => {
    expect(
      resolvePushEligibility({ hasPushManager: true, isIosDevice: false, isStandalone: false }),
    ).toBe("eligible");
    expect(
      resolvePushEligibility({ hasPushManager: true, isIosDevice: false, isStandalone: true }),
    ).toBe("eligible");
  });
});
