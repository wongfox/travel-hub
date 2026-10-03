import { describe, expect, it } from "vitest";
import { createInMemoryConsentStore } from "../privacy/consent-store.js";
import { createInMemoryPushSubscriptionStore } from "./push-subscription-store.js";
import { subscribePush } from "./subscribe-push.js";
import { ConsentRequiredError } from "../privacy/consent-guard.js";

const INPUT = {
  linkId: "link-1",
  reservationRef: "RES-1001",
  passengerScope: [] as string[],
  endpoint: "https://push.example.com/endpoint-1",
  p256dh: "p256dh-1",
  auth: "auth-1",
  locale: "es" as const,
  expiresAt: "2026-11-05T00:00:00.000Z",
};

describe("subscribePush", () => {
  it("creates a subscription when a recorded, granted push consent exists", async () => {
    const consentStore = createInMemoryConsentStore();
    const subscriptionStore = createInMemoryPushSubscriptionStore();
    const consent = await consentStore.record({
      linkId: "link-1",
      reservationRef: "RES-1001",
      passengerRef: null,
      purpose: "push",
      textVersion: "v1",
      granted: true,
    });

    const result = await subscribePush(INPUT, { consentStore, subscriptionStore });

    expect(result.linkId).toBe("link-1");
    expect(result.consentRecordId).toBe(consent.id);
    expect(result.expiresAt).toBe(INPUT.expiresAt);
  });

  it("throws ConsentRequiredError and creates no subscription when no push consent is recorded (task 11.1 acceptance: no subscription is created without a recorded push consent)", async () => {
    const consentStore = createInMemoryConsentStore();
    const subscriptionStore = createInMemoryPushSubscriptionStore();

    await expect(subscribePush(INPUT, { consentStore, subscriptionStore })).rejects.toThrow(ConsentRequiredError);

    expect(await subscriptionStore.findActiveByReservation("RES-1001")).toEqual([]);
  });

  it("throws ConsentRequiredError when the latest recorded push consent was withdrawn", async () => {
    const consentStore = createInMemoryConsentStore();
    const subscriptionStore = createInMemoryPushSubscriptionStore();
    await consentStore.record({
      linkId: "link-1",
      reservationRef: "RES-1001",
      passengerRef: null,
      purpose: "push",
      textVersion: "v1",
      granted: false,
    });

    await expect(subscribePush(INPUT, { consentStore, subscriptionStore })).rejects.toThrow(ConsentRequiredError);
    expect(await subscriptionStore.findActiveByReservation("RES-1001")).toEqual([]);
  });

  it("is unaffected by a granted consent for an unrelated purpose", async () => {
    const consentStore = createInMemoryConsentStore();
    const subscriptionStore = createInMemoryPushSubscriptionStore();
    await consentStore.record({
      linkId: "link-1",
      reservationRef: "RES-1001",
      passengerRef: null,
      purpose: "analytics",
      textVersion: "v1",
      granted: true,
    });

    await expect(subscribePush(INPUT, { consentStore, subscriptionStore })).rejects.toThrow(ConsentRequiredError);
  });
});
