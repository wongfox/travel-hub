import { afterEach, describe, expect, it } from "vitest";
import { hasAnalyticsConsentGranted, setAnalyticsConsentGranted } from "./analytics-consent.js";

afterEach(() => {
  localStorage.clear();
});

describe("analytics-consent", () => {
  it("defaults to not granted when nothing has ever been set", () => {
    expect(hasAnalyticsConsentGranted()).toBe(false);
  });

  it("reflects granted after setAnalyticsConsentGranted(true)", () => {
    setAnalyticsConsentGranted(true);

    expect(hasAnalyticsConsentGranted()).toBe(true);
  });

  it("reflects withdrawn after setAnalyticsConsentGranted(false), even after having been granted (task 12.3)", () => {
    setAnalyticsConsentGranted(true);
    setAnalyticsConsentGranted(false);

    expect(hasAnalyticsConsentGranted()).toBe(false);
  });
});
