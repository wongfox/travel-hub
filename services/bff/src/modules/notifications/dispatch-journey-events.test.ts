import { describe, expect, it } from "vitest";
import { createInMemoryNotificationStore } from "./notification-store.js";
import { createInMemoryPushSubscriptionStore } from "./push-subscription-store.js";
import { createWebPushStub } from "../../adapters/web-push/stub.js";
import { dispatchJourneyEvents } from "./dispatch-journey-events.js";
import type { JourneyEvent } from "./ports.js";
import { DEFAULT_ALERT_SOURCE_POLICY } from "../../config/alert-source-policy.js";

const RELOCATION_EVENT: JourneyEvent = {
  reservationRef: "RES-1001",
  legRef: "LEG-1",
  type: "RELOCATION",
  sourceEventId: "relocation:LEG-1:2026-10-01T00:00:00.000Z",
  occurredAt: "2026-10-01T00:00:00.000Z",
};

function buildDeps(overrides: { alertSourcePolicy?: typeof DEFAULT_ALERT_SOURCE_POLICY } = {}) {
  return {
    notificationStore: createInMemoryNotificationStore(),
    subscriptionStore: createInMemoryPushSubscriptionStore(),
    webPush: createWebPushStub(),
    alertSourcePolicy: overrides.alertSourcePolicy ?? DEFAULT_ALERT_SOURCE_POLICY,
  };
}

describe("dispatchJourneyEvents", () => {
  it("results in banner-only delivery (no push.send call) when push is not the official source for that alert type (task 11.2 acceptance)", async () => {
    const deps = buildDeps({ alertSourcePolicy: { ...DEFAULT_ALERT_SOURCE_POLICY, RELOCATION: { pushIsOfficialSource: false } } });
    await deps.subscriptionStore.create({
      linkId: "link-1",
      reservationRef: "RES-1001",
      passengerScope: [],
      endpoint: "https://push.example.com/endpoint-1",
      p256dh: "p1",
      auth: "a1",
      locale: "es",
      consentRecordId: "c1",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });

    const result = await dispatchJourneyEvents([RELOCATION_EVENT], deps);

    expect(result.skippedByPolicy).toBe(1);
    expect(deps.webPush.sentPayloads).toHaveLength(0);
    const stored = await deps.notificationStore.findByDedupeKey(
      "RELOCATION:RES-1001:relocation:LEG-1:2026-10-01T00:00:00.000Z",
    );
    expect(stored?.channel).toBe("banner");
    expect(stored?.status).toBe("skipped_policy");
  });

  it("dispatches push to every active subscription for the reservation when push is the official source", async () => {
    const deps = buildDeps();
    await deps.subscriptionStore.create({
      linkId: "link-1",
      reservationRef: "RES-1001",
      passengerScope: [],
      endpoint: "https://push.example.com/endpoint-1",
      p256dh: "p1",
      auth: "a1",
      locale: "es",
      consentRecordId: "c1",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    await deps.subscriptionStore.create({
      linkId: "link-1",
      reservationRef: "RES-1001",
      passengerScope: [],
      endpoint: "https://push.example.com/endpoint-2",
      p256dh: "p2",
      auth: "a2",
      locale: "es",
      consentRecordId: "c1",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });

    const result = await dispatchJourneyEvents([RELOCATION_EVENT], deps);

    expect(result.pushed).toBe(1);
    expect(deps.webPush.sentPayloads).toHaveLength(2);
    const stored = await deps.notificationStore.findByDedupeKey(
      "RELOCATION:RES-1001:relocation:LEG-1:2026-10-01T00:00:00.000Z",
    );
    expect(stored?.channel).toBe("push");
    expect(stored?.status).toBe("sent");
  });

  it("a duplicate event (same dedupeKey) does not produce a second notification row (unique dedupe_key)", async () => {
    const deps = buildDeps();

    await dispatchJourneyEvents([RELOCATION_EVENT], deps);
    const result = await dispatchJourneyEvents([RELOCATION_EVENT], deps);

    expect(result.skippedDuplicate).toBe(1);
    const dedupeKey = "RELOCATION:RES-1001:relocation:LEG-1:2026-10-01T00:00:00.000Z";
    expect(await deps.notificationStore.findByDedupeKey(dedupeKey)).not.toBeNull();
  });

  it("deletes a subscription whose endpoint the push service reports gone (404/410)", async () => {
    const deps = buildDeps();
    const goneSubscription = await deps.subscriptionStore.create({
      linkId: "link-1",
      reservationRef: "RES-1001",
      passengerScope: [],
      endpoint: "https://push.example.com/gone-endpoint",
      p256dh: "p1",
      auth: "a1",
      locale: "es",
      consentRecordId: "c1",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });

    await dispatchJourneyEvents([RELOCATION_EVENT], deps);

    expect(await deps.subscriptionStore.findById(goneSubscription.id)).toBeNull();
  });

  it("marks the notification 'failed' (not 'sent') when there is no active subscription to push to", async () => {
    const deps = buildDeps();

    await dispatchJourneyEvents([RELOCATION_EVENT], deps);

    const stored = await deps.notificationStore.findByDedupeKey(
      "RELOCATION:RES-1001:relocation:LEG-1:2026-10-01T00:00:00.000Z",
    );
    expect(stored?.channel).toBe("push");
    expect(stored?.status).toBe("failed");
  });

  it("processes multiple events independently — one event's outcome never blocks another's", async () => {
    const deps = buildDeps();
    const secondEvent: JourneyEvent = {
      reservationRef: "RES-2002",
      legRef: "LEG-2",
      type: "RELOCATION",
      sourceEventId: "relocation:LEG-2:2026-10-02T00:00:00.000Z",
      occurredAt: "2026-10-02T00:00:00.000Z",
    };

    const result = await dispatchJourneyEvents([RELOCATION_EVENT, secondEvent], deps);

    expect(result.processed).toBe(2);
  });

  it("one event's unhandled failure does not abort the rest of the batch (R3-001)", async () => {
    const deps = buildDeps();
    const secondEvent: JourneyEvent = {
      reservationRef: "RES-2002",
      legRef: "LEG-2",
      type: "RELOCATION",
      sourceEventId: "relocation:LEG-2:2026-10-02T00:00:00.000Z",
      occurredAt: "2026-10-02T00:00:00.000Z",
    };
    const explodingSubscriptionStore: typeof deps.subscriptionStore = {
      ...deps.subscriptionStore,
      async findActiveByReservation(reservationRef) {
        if (reservationRef === RELOCATION_EVENT.reservationRef) {
          throw new Error("simulated subscription lookup failure");
        }
        return deps.subscriptionStore.findActiveByReservation(reservationRef);
      },
    };

    const result = await dispatchJourneyEvents([RELOCATION_EVENT, secondEvent], {
      ...deps,
      subscriptionStore: explodingSubscriptionStore,
    });

    expect(result.processed).toBe(2);
    expect(result.failed).toBe(1);
    // The second event still reached notificationStore.create despite the first's failure.
    const secondOutcome = await deps.notificationStore.findByDedupeKey(
      `${secondEvent.type}:${secondEvent.reservationRef}:${secondEvent.sourceEventId}`,
    );
    expect(secondOutcome).not.toBeNull();
  });
});
