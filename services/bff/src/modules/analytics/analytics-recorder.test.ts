import { describe, expect, it } from "vitest";
import { createInMemoryAnalyticsEventStore } from "./analytics-event-store.js";
import { createAnalyticsRecorder, recordAnalyticsBestEffort } from "./analytics-recorder.js";

describe("createAnalyticsRecorder", () => {
  it("records an event with a trip_hash computed from reservationRef, never storing the raw reservationRef", async () => {
    const store = createInMemoryAnalyticsEventStore(() => new Date("2026-10-01T00:00:00.000Z"));
    const recorder = createAnalyticsRecorder({ analyticsEventStore: store, secret: "secret-1" });

    await recorder.record({ reservationRef: "RES-1001", name: "wifi_offer_viewed" });

    const [record] = await store.list();
    expect(record).toBeDefined();
    expect("reservationRef" in record!).toBe(false);
    expect(record!.tripHash).not.toBe("RES-1001");
    expect(record!.tripHash).toMatch(/^[0-9a-f]{64}$/);
    expect(record!.name).toBe("wifi_offer_viewed");
  });

  it("uses the injected clock for occurredAt when the caller does not supply one", async () => {
    const store = createInMemoryAnalyticsEventStore();
    const recorder = createAnalyticsRecorder({
      analyticsEventStore: store,
      secret: "secret-1",
      now: () => new Date("2026-11-02T08:00:00.000Z"),
    });

    await recorder.record({ reservationRef: "RES-1001", name: "push_opt_in" });

    const [record] = await store.list();
    expect(record!.occurredAt).toBe("2026-11-02T08:00:00.000Z");
  });

  it("passes through caller-supplied occurredAt and props unchanged", async () => {
    const store = createInMemoryAnalyticsEventStore();
    const recorder = createAnalyticsRecorder({ analyticsEventStore: store, secret: "secret-1" });

    await recorder.record({
      reservationRef: "RES-1001",
      name: "wifi_package_selected",
      occurredAt: "2026-11-02T07:00:00.000Z",
      props: { packageId: "WIFI-60" },
    });

    const [record] = await store.list();
    expect(record!.occurredAt).toBe("2026-11-02T07:00:00.000Z");
    expect(record!.props).toEqual({ packageId: "WIFI-60" });
  });
});

describe("recordAnalyticsBestEffort", () => {
  it("is a no-op when no recorder is given (backward compatible for callers that predate task 12.2)", async () => {
    await expect(recordAnalyticsBestEffort(undefined, { reservationRef: "RES-1001", name: "screen_view" })).resolves.toBeUndefined();
  });

  it("swallows a recorder failure instead of propagating it — analytics must never break the instrumented action", async () => {
    const recorder = {
      async record() {
        throw new Error("simulated analytics store failure");
      },
    };

    await expect(
      recordAnalyticsBestEffort(recorder, { reservationRef: "RES-1001", name: "screen_view" }),
    ).resolves.toBeUndefined();
  });

  it("calls through to the recorder when given", async () => {
    const calls: string[] = [];
    const recorder = {
      async record(input: { name: string }) {
        calls.push(input.name);
      },
    };

    await recordAnalyticsBestEffort(recorder, { reservationRef: "RES-1001", name: "wifi_offer_viewed" });

    expect(calls).toEqual(["wifi_offer_viewed"]);
  });
});
