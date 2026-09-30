import { describe, expect, it } from "vitest";
import { createInMemoryConsentStore } from "./consent-store.js";
import { assertConsentGranted, ConsentRequiredError } from "./consent-guard.js";

describe("assertConsentGranted", () => {
  it("throws ConsentRequiredError when no consent has ever been recorded for the purpose", async () => {
    const store = createInMemoryConsentStore();

    await expect(
      assertConsentGranted({ consentStore: store }, "RES-1001", null, "precheckin_biometric"),
    ).rejects.toThrow(ConsentRequiredError);
  });

  it("carries the purpose that was rejected, for the HTTP layer to report", async () => {
    const store = createInMemoryConsentStore();

    await expect(
      assertConsentGranted({ consentStore: store }, "RES-1001", null, "pulse"),
    ).rejects.toMatchObject({ purpose: "pulse" });
  });

  it("throws ConsentRequiredError when the latest recorded consent was a withdrawal", async () => {
    const store = createInMemoryConsentStore();
    await store.record({
      linkId: "link-1",
      reservationRef: "RES-1001",
      passengerRef: null,
      purpose: "precheckin_biometric",
      textVersion: "v1",
      granted: false,
    });

    await expect(
      assertConsentGranted({ consentStore: store }, "RES-1001", null, "precheckin_biometric"),
    ).rejects.toThrow(ConsentRequiredError);
  });

  it("resolves with the latest consent record when it is currently granted", async () => {
    const store = createInMemoryConsentStore();
    const granted = await store.record({
      linkId: "link-1",
      reservationRef: "RES-1001",
      passengerRef: null,
      purpose: "precheckin_biometric",
      textVersion: "v1",
      granted: true,
    });

    const result = await assertConsentGranted(
      { consentStore: store },
      "RES-1001",
      null,
      "precheckin_biometric",
    );

    expect(result).toEqual(granted);
  });

  it("re-checks the latest state: a granted-then-withdrawn purpose is rejected again", async () => {
    const store = createInMemoryConsentStore();
    await store.record({
      linkId: "link-1",
      reservationRef: "RES-1001",
      passengerRef: null,
      purpose: "precheckin_biometric",
      textVersion: "v1",
      granted: true,
    });
    await store.record({
      linkId: "link-1",
      reservationRef: "RES-1001",
      passengerRef: null,
      purpose: "precheckin_biometric",
      textVersion: "v1",
      granted: false,
    });

    await expect(
      assertConsentGranted({ consentStore: store }, "RES-1001", null, "precheckin_biometric"),
    ).rejects.toThrow(ConsentRequiredError);
  });
});
