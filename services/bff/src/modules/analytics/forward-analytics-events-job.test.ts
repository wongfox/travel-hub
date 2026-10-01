import { describe, expect, it } from "vitest";
import { createInMemoryAnalyticsEventStore } from "./analytics-event-store.js";
import { createAnalyticsSinkStub } from "../../adapters/analytics-sink/stub.js";
import { runForwardAnalyticsEventsJob } from "./forward-analytics-events-job.js";

describe("runForwardAnalyticsEventsJob", () => {
  it("forwards every pending event as a pseudonymous payload and marks them forwarded", async () => {
    const store = createInMemoryAnalyticsEventStore(() => new Date("2026-10-01T00:00:00.000Z"));
    await store.create({ name: "screen_view", tripHash: "a".repeat(64), occurredAt: "2026-10-01T00:00:00.000Z" });
    await store.create({ name: "tfe_click_out", tripHash: "b".repeat(64), occurredAt: "2026-10-01T00:00:01.000Z" });
    const sink = createAnalyticsSinkStub();

    const result = await runForwardAnalyticsEventsJob({
      analyticsEventStore: store,
      analyticsSink: sink,
      now: () => new Date("2026-10-01T01:00:00.000Z"),
    });

    expect(result.forwarded).toBe(2);
    expect(sink.deliveries).toHaveLength(1);
    expect(sink.deliveries[0]).toHaveLength(2);
    expect(await store.listPendingForward()).toHaveLength(0);
  });

  it("never includes a reservationRef field anywhere in the sink payload — only trip_hash", async () => {
    const store = createInMemoryAnalyticsEventStore();
    await store.create({ name: "wifi_offer_viewed", tripHash: "c".repeat(64), occurredAt: "2026-10-01T00:00:00.000Z" });
    const sink = createAnalyticsSinkStub();

    await runForwardAnalyticsEventsJob({ analyticsEventStore: store, analyticsSink: sink });

    const [batch] = sink.deliveries;
    for (const event of batch!) {
      expect("reservationRef" in event).toBe(false);
      expect(Object.keys(event).sort()).toEqual(["name", "occurredAt", "tripHash"].sort());
    }
  });

  it("is a no-op when there is nothing pending", async () => {
    const store = createInMemoryAnalyticsEventStore();
    const sink = createAnalyticsSinkStub();

    const result = await runForwardAnalyticsEventsJob({ analyticsEventStore: store, analyticsSink: sink });

    expect(result).toEqual({ forwarded: 0 });
    expect(sink.deliveries).toHaveLength(0);
  });

  it("leaves pending events pending when the sink fails — no partial marking, safe for the next retry", async () => {
    const store = createInMemoryAnalyticsEventStore();
    await store.create({ name: "screen_view", tripHash: "a".repeat(64), occurredAt: "2026-10-01T00:00:00.000Z" });
    const sink = createAnalyticsSinkStub();
    sink.simulateFailureOnce();

    await expect(
      runForwardAnalyticsEventsJob({ analyticsEventStore: store, analyticsSink: sink }),
    ).rejects.toThrow(/simulated AnalyticsSinkPort failure/);

    expect(await store.listPendingForward()).toHaveLength(1);
  });
});
