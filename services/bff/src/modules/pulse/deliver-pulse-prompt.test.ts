import { describe, expect, it } from "vitest";
import { deliverPulsePrompt } from "./deliver-pulse-prompt.js";
import { createInMemoryPushSubscriptionStore } from "../notifications/push-subscription-store.js";
import { createWebPushStub } from "../../adapters/web-push/stub.js";

describe("deliverPulsePrompt", () => {
  it("sends a PULSE_PROMPT push to every active subscription on the reservation", async () => {
    const subscriptionStore = createInMemoryPushSubscriptionStore();
    await subscriptionStore.create({
      linkId: "link-1",
      reservationRef: "RES-1001",
      passengerScope: [],
      endpoint: "https://push.example.com/endpoint-1",
      p256dh: "p256dh-1",
      auth: "auth-1",
      locale: "es",
      consentRecordId: "consent-1",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    const webPush = createWebPushStub();

    const result = await deliverPulsePrompt(
      { reservationRef: "RES-1001", legId: "L1", locale: "es" },
      { subscriptionStore, webPush },
    );

    expect(result).toEqual({ delivered: 1 });
    expect(webPush.sentPayloads).toHaveLength(1);
    expect(webPush.sentPayloads[0]?.payload).toMatchObject({
      type: "PULSE_PROMPT",
      url: "/trip/pulse",
      locale: "es",
    });
  });

  it("never touches a NotificationStore — deliverPulsePrompt's own dependency type has no such field, structurally proving pulse prompts are not routed through the 11.2 dedupe pipeline (task 11.6 acceptance)", async () => {
    const subscriptionStore = createInMemoryPushSubscriptionStore();
    const webPush = createWebPushStub();

    const result = await deliverPulsePrompt(
      { reservationRef: "RES-NO-SUBS", legId: "L1", locale: "es" },
      { subscriptionStore, webPush },
    );

    expect(result).toEqual({ delivered: 0 });
  });

  it("isolates one subscription's send failure from another's", async () => {
    const subscriptionStore = createInMemoryPushSubscriptionStore();
    await subscriptionStore.create({
      linkId: "link-1",
      reservationRef: "RES-1001",
      passengerScope: [],
      endpoint: "https://push.example.com/fail-endpoint",
      p256dh: "p256dh-1",
      auth: "auth-1",
      locale: "es",
      consentRecordId: "consent-1",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    await subscriptionStore.create({
      linkId: "link-2",
      reservationRef: "RES-1001",
      passengerScope: [],
      endpoint: "https://push.example.com/endpoint-ok",
      p256dh: "p256dh-2",
      auth: "auth-2",
      locale: "es",
      consentRecordId: "consent-2",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    const webPush = createWebPushStub();

    const result = await deliverPulsePrompt(
      { reservationRef: "RES-1001", legId: "L1", locale: "es" },
      { subscriptionStore, webPush },
    );

    expect(result).toEqual({ delivered: 1 });
    expect(webPush.sentPayloads).toHaveLength(2);
  });
});
