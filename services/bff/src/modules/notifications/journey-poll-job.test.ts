import { afterEach, describe, expect, it, vi } from "vitest";
import { createInMemoryQueueClient } from "../../infra/queue/queue-client.js";
import { registerJourneyPollJob, JOURNEY_POLL_QUEUE } from "./journey-poll-job.js";
import { createInMemoryNotificationStore } from "./notification-store.js";
import { createInMemoryPushSubscriptionStore } from "./push-subscription-store.js";
import { createWebPushStub } from "../../adapters/web-push/stub.js";
import { DEFAULT_ALERT_SOURCE_POLICY } from "../../config/alert-source-policy.js";
import type { JourneyEventSourcePort } from "./ports.js";
import { scheduleJourneyPoll, JOURNEY_POLL_QUEUE } from "./journey-poll-job.js";

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

describe("scheduleJourneyPoll", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("enqueues an idempotent scan for its queue on every tick, defaults to 60000 ms, and stops when asked", async () => {
    vi.useFakeTimers();
    const sendIdempotent = vi.fn().mockResolvedValue(undefined);

    const stop = scheduleJourneyPoll({ sendIdempotent }, { intervalMs: 1000 });
    expect(sendIdempotent).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(sendIdempotent).toHaveBeenCalledTimes(1);
    expect(sendIdempotent).toHaveBeenCalledWith(JOURNEY_POLL_QUEUE, "scan", {});

    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(sendIdempotent).toHaveBeenCalledTimes(1);

    const stopDefault = scheduleJourneyPoll({ sendIdempotent });
    await vi.advanceTimersByTimeAsync(60000 - 1);
    expect(sendIdempotent).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sendIdempotent).toHaveBeenCalledTimes(2);
    stopDefault();
  });
});
