import { describe, expect, it } from "vitest";
import { createInMemoryConsentStore } from "./consent-store.js";
import { recordConsent } from "./record-consent.js";

describe("recordConsent", () => {
  it("appends a consent record and returns it as a ConsentState", async () => {
    const store = createInMemoryConsentStore();

    const result = await recordConsent(
      { linkId: "link-1", reservationRef: "RES-1001", purpose: "precheckin_biometric", textVersion: "v1", granted: true },
      { consentStore: store },
    );

    expect(result).toEqual({
      purpose: "precheckin_biometric",
      granted: true,
      textVersion: "v1",
      recordedAt: expect.any(String),
    });
  });

  it("persists the record at reservation scope (passengerRef null) so a later lookup finds it", async () => {
    const store = createInMemoryConsentStore();

    await recordConsent(
      { linkId: "link-1", reservationRef: "RES-1001", purpose: "push", textVersion: "v2", granted: false },
      { consentStore: store },
    );

    const latest = await store.findLatest("RES-1001", null, "push");
    expect(latest?.granted).toBe(false);
    expect(latest?.linkId).toBe("link-1");
  });
});
