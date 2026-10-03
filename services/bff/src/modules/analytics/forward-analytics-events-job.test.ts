import { afterEach, describe, expect, it, vi } from "vitest";
import { createInMemoryAnalyticsEventStore } from "./analytics-event-store.js";
import { createAnalyticsSinkStub } from "../../adapters/analytics-sink/stub.js";
import {
  runForwardAnalyticsEventsJob,
  registerForwardAnalyticsEventsJob,
  scheduleAnalyticsForward,
  ANALYTICS_FORWARD_QUEUE,
} from "./forward-analytics-events-job.js";
import { createInMemoryConsentStore } from "../privacy/consent-store.js";
import { createInMemoryQueueClient } from "../../infra/queue/queue-client.js";
import { computeTripHash } from "./trip-hash.js";

const SECRET = "test-secret";

async function consentStoreWith(grants: Record<string, boolean>) {
  const consentStore = createInMemoryConsentStore();
  for (const [reservationRef, granted] of Object.entries(grants)) {
    await consentStore.record({
      linkId: "link",
      reservationRef,
      passengerRef: null,
      purpose: "analytics",
      textVersion: "v1",
      granted,
    });
  }
  return consentStore;
}

describe("runForwardAnalyticsEventsJob", () => {
  it("forwards every pending event as a pseudonymous payload and marks them forwarded", async () => {
    const store = createInMemoryAnalyticsEventStore(() => new Date("2026-10-01T00:00:00.000Z"));
    await store.create({ name: "screen_view", tripHash: computeTripHash("RES-A", SECRET), occurredAt: "2026-10-01T00:00:00.000Z" });
    await store.create({ name: "tfe_click_out", tripHash: computeTripHash("RES-B", SECRET), occurredAt: "2026-10-01T00:00:01.000Z" });
    const sink = createAnalyticsSinkStub();

    const result = await runForwardAnalyticsEventsJob({
      analyticsEventStore: store,
      analyticsSink: sink,
      consentStore: await consentStoreWith({ "RES-A": true, "RES-B": true }),
      secret: SECRET,
      now: () => new Date("2026-10-01T01:00:00.000Z"),
    });

    expect(result.forwarded).toBe(2);
    expect(sink.deliveries).toHaveLength(1);
    expect(sink.deliveries[0]).toHaveLength(2);
    expect(await store.listPendingForward()).toHaveLength(0);
  });

  it("never includes a reservationRef field anywhere in the sink payload — only trip_hash", async () => {
    const store = createInMemoryAnalyticsEventStore();
    await store.create({ name: "wifi_offer_viewed", tripHash: computeTripHash("RES-C", SECRET), occurredAt: "2026-10-01T00:00:00.000Z" });
    const sink = createAnalyticsSinkStub();

    await runForwardAnalyticsEventsJob({
      analyticsEventStore: store,
      analyticsSink: sink,
      consentStore: await consentStoreWith({ "RES-C": true }),
      secret: SECRET,
    });

    const [batch] = sink.deliveries;
    for (const event of batch!) {
      expect("reservationRef" in event).toBe(false);
      expect(Object.keys(event).sort()).toEqual(["name", "occurredAt", "tripHash"].sort());
    }
  });

  it("is a no-op when there is nothing pending", async () => {
    const store = createInMemoryAnalyticsEventStore();
    const sink = createAnalyticsSinkStub();

    const result = await runForwardAnalyticsEventsJob({
      analyticsEventStore: store,
      analyticsSink: sink,
      consentStore: await consentStoreWith({}),
      secret: SECRET,
    });

    expect(result).toEqual({ forwarded: 0 });
    expect(sink.deliveries).toHaveLength(0);
  });

  it("leaves pending events pending when the sink fails — no partial marking, safe for the next retry", async () => {
    const store = createInMemoryAnalyticsEventStore();
    await store.create({ name: "screen_view", tripHash: computeTripHash("RES-A", SECRET), occurredAt: "2026-10-01T00:00:00.000Z" });
    const sink = createAnalyticsSinkStub();
    sink.simulateFailureOnce();

    await expect(
      runForwardAnalyticsEventsJob({
        analyticsEventStore: store,
        analyticsSink: sink,
        consentStore: await consentStoreWith({ "RES-A": true }),
        secret: SECRET,
      }),
    ).rejects.toThrow(/simulated AnalyticsSinkPort failure/);

    expect(await store.listPendingForward()).toHaveLength(1);
  });

  it("re-checks consent at forward time: rows of a withdrawn (or never-granted) trip are deleted and never reach the sink", async () => {
    const store = createInMemoryAnalyticsEventStore();
    const granted = computeTripHash("RES-OK", SECRET);
    const withdrawn = computeTripHash("RES-WITHDRAWN", SECRET);
    const unknown = computeTripHash("RES-UNKNOWN", SECRET);
    await store.create({ name: "screen_view", tripHash: granted, occurredAt: "2026-10-01T00:00:00.000Z" });
    await store.create({ name: "screen_view", tripHash: withdrawn, occurredAt: "2026-10-01T00:00:01.000Z" });
    await store.create({ name: "screen_view", tripHash: unknown, occurredAt: "2026-10-01T00:00:02.000Z" });
    const sink = createAnalyticsSinkStub();

    const result = await runForwardAnalyticsEventsJob({
      analyticsEventStore: store,
      analyticsSink: sink,
      consentStore: await consentStoreWith({ "RES-OK": true, "RES-WITHDRAWN": false }),
      secret: SECRET,
    });

    expect(result.forwarded).toBe(1);
    expect(sink.deliveries[0]!.map((e) => e.tripHash)).toEqual([granted]);
    expect((await store.list()).map((r) => r.tripHash)).toEqual([granted]);
  });
});

describe("scheduleAnalyticsForward", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("enqueues the forward scan on every tick so pending events are forwarded with no manual trigger, and stops when asked", async () => {
    vi.useFakeTimers();
    const store = createInMemoryAnalyticsEventStore(() => new Date("2026-10-01T00:00:00.000Z"));
    await store.create({ name: "screen_view", tripHash: computeTripHash("RES-A", SECRET), occurredAt: "2026-10-01T00:00:00.000Z" });
    const sink = createAnalyticsSinkStub();
    const queueClient = createInMemoryQueueClient();
    await queueClient.start();
    await registerForwardAnalyticsEventsJob(queueClient, {
      analyticsEventStore: store,
      analyticsSink: sink,
      consentStore: await consentStoreWith({ "RES-A": true }),
      secret: SECRET,
    });

    const stop = scheduleAnalyticsForward(queueClient, { intervalMs: 1000 });
    await queueClient.runPendingOnce(ANALYTICS_FORWARD_QUEUE);
    expect(await store.listPendingForward()).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1000);
    // Overlapping ticks collapse into one pending job (natural-key dedupe).
    await vi.advanceTimersByTimeAsync(1000);
    await queueClient.runPendingOnce(ANALYTICS_FORWARD_QUEUE);
    expect(await store.listPendingForward()).toHaveLength(0);

    stop();
  });
});
