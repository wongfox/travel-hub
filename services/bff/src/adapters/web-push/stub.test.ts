import { describe, expect, it } from "vitest";
import { createWebPushStub } from "./stub.js";
import type { PushSubscriptionRecord } from "../../modules/notifications/ports.js";

function buildSubscription(endpoint: string): PushSubscriptionRecord {
  return {
    id: "sub-1",
    linkId: "link-1",
    reservationRef: "RES-1001",
    passengerScope: [],
    endpoint,
    p256dh: "p256dh-1",
    auth: "auth-1",
    locale: "es",
    consentRecordId: "consent-1",
    createdAt: "2026-10-01T00:00:00.000Z",
    expiresAt: "2026-11-05T00:00:00.000Z",
  };
}

const PAYLOAD = {
  type: "RELOCATION" as const,
  titleKey: "alerts.relocation.title",
  bodyKey: "alerts.relocation.body",
  url: "/trip",
  locale: "es" as const,
};

describe("createWebPushStub", () => {
  it("returns 'sent' and records the call for a normal endpoint", async () => {
    const stub = createWebPushStub();
    const subscription = buildSubscription("https://push.example.com/endpoint-1");

    const outcome = await stub.send(subscription, PAYLOAD);

    expect(outcome).toBe("sent");
    expect(stub.sentPayloads).toHaveLength(1);
    expect(stub.sentPayloads[0]).toMatchObject({ endpoint: subscription.endpoint, payload: PAYLOAD });
  });

  it("returns 'gone' for an endpoint deterministically marked gone (simulating a 404/410 from the push service)", async () => {
    const stub = createWebPushStub();
    const subscription = buildSubscription("https://push.example.com/gone-endpoint");

    expect(await stub.send(subscription, PAYLOAD)).toBe("gone");
  });

  it("returns 'failed' for an endpoint deterministically marked failing", async () => {
    const stub = createWebPushStub();
    const subscription = buildSubscription("https://push.example.com/fail-endpoint");

    expect(await stub.send(subscription, PAYLOAD)).toBe("failed");
  });

  it("simulateFailureOnce forces the next call to 'failed' regardless of endpoint, then returns to normal", async () => {
    const stub = createWebPushStub();
    const subscription = buildSubscription("https://push.example.com/endpoint-1");
    stub.simulateFailureOnce();

    expect(await stub.send(subscription, PAYLOAD)).toBe("failed");
    expect(await stub.send(subscription, PAYLOAD)).toBe("sent");
  });
});
