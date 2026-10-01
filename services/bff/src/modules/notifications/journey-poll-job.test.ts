import { describe, expect, it } from "vitest";
import { createInMemoryQueueClient } from "../../infra/queue/queue-client.js";
import { registerJourneyPollJob, JOURNEY_POLL_QUEUE } from "./journey-poll-job.js";
import { createInMemoryNotificationStore } from "./notification-store.js";
import { createInMemoryPushSubscriptionStore } from "./push-subscription-store.js";
import { createWebPushStub } from "../../adapters/web-push/stub.js";
import { DEFAULT_ALERT_SOURCE_POLICY } from "../../config/alert-source-policy.js";
import type { JourneyEventSourcePort } from "./ports.js";

function buildEventSourceStub(): JourneyEventSourcePort {
  return {
    async pollActive() {
      return [
        {
          reservationRef: "RES-1001",
          legRef: "L1",
          type: "RELOCATION",
          sourceEventId: "L1:2026-10-30T12:00:00.000Z",
          occurredAt: "2026-10-30T12:00:00.000Z",
        },
      ];
    },
  };
}

describe("registerJourneyPollJob", () => {
  it("polls the journey event source and dispatches every event when the queue is triggered", async () => {
    const queueClient = createInMemoryQueueClient();
    const notificationStore = createInMemoryNotificationStore();
    const subscriptionStore = createInMemoryPushSubscriptionStore();
    await subscriptionStore.create({
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
    const webPush = createWebPushStub();

    await registerJourneyPollJob(queueClient, {
      journeyEventSource: buildEventSourceStub(),
      notificationStore,
      subscriptionStore,
      webPush,
      alertSourcePolicy: DEFAULT_ALERT_SOURCE_POLICY,
      pollWindowHours: 48,
    });
    await queueClient.sendIdempotent(JOURNEY_POLL_QUEUE, "scan", {});
    await queueClient.runPendingOnce(JOURNEY_POLL_QUEUE);

    expect(webPush.sentPayloads).toHaveLength(1);
    const stored = await notificationStore.findByDedupeKey("RELOCATION:RES-1001:L1:2026-10-30T12:00:00.000Z");
    expect(stored?.status).toBe("sent");
  });
});
