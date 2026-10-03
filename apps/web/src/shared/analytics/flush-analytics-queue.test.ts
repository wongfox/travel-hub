import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createApiClient } from "../api/client.js";
import { enqueueAnalyticsEvent, listQueuedAnalyticsEvents } from "./analytics-queue-store.js";
import { flushAnalyticsQueue } from "./flush-analytics-queue.js";

function fakeApiClient(fetchImpl: typeof fetch) {
  return createApiClient({ fetchImpl });
}

describe("flushAnalyticsQueue", () => {
  it("is a no-op (skipped: true) when nothing is queued", async () => {
    const apiClient = fakeApiClient(async () => new Response(null, { status: 204 }));

    const result = await flushAnalyticsQueue({ apiClient });

    expect(result).toEqual({ sent: 0, skipped: true });
  });

  it("sends via sendBeacon when available and clears the queue on acceptance", async () => {
    const marker = crypto.randomUUID();
    await enqueueAnalyticsEvent({ name: "screen_view", props: { marker } });
    const beaconCalls: { url: string; body: Blob }[] = [];
    const apiClient = fakeApiClient(async () => {
      throw new Error("apiClient.post must not be called when sendBeacon succeeds");
    });

    const result = await flushAnalyticsQueue({
      apiClient,
      sendBeacon: (url, body) => {
        beaconCalls.push({ url, body });
        return true;
      },
    });

    expect(result.sent).toBeGreaterThan(0);
    expect(beaconCalls).toHaveLength(1);
    expect(beaconCalls[0]?.url).toBe("/api/events");
    const remaining = (await listQueuedAnalyticsEvents()).filter((e) => e.props?.marker === marker);
    expect(remaining).toHaveLength(0);
  });

  it("falls back to apiClient.post when sendBeacon returns false, and clears the queue only after a successful response", async () => {
    const marker = crypto.randomUUID();
    await enqueueAnalyticsEvent({ name: "tfe_click_out", props: { marker } });
    let postCalled = false;
    const apiClient = fakeApiClient(async () => {
      postCalled = true;
      return new Response(JSON.stringify({ status: "accepted" }), { status: 202 });
    });

    const result = await flushAnalyticsQueue({ apiClient, sendBeacon: () => false });

    expect(postCalled).toBe(true);
    expect(result.sent).toBeGreaterThan(0);
    const remaining = (await listQueuedAnalyticsEvents()).filter((e) => e.props?.marker === marker);
    expect(remaining).toHaveLength(0);
  });

  it("chunks a queue over 50 events into multiple ≤50-event requests, never one oversized batch (R3-001)", async () => {
    const marker = crypto.randomUUID();
    for (let i = 0; i < 61; i += 1) {
      await enqueueAnalyticsEvent({ name: "screen_view", props: { marker, i } });
    }
    const batchSizes: number[] = [];
    const apiClient = fakeApiClient(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { events: unknown[] };
      batchSizes.push(body.events.length);
      return new Response(JSON.stringify({ status: "accepted" }), { status: 202 });
    });

    const result = await flushAnalyticsQueue({ apiClient, sendBeacon: () => false });

    expect(batchSizes.every((size) => size <= 50)).toBe(true);
    expect(batchSizes.reduce((sum, size) => sum + size, 0)).toBe(result.sent);
    expect(batchSizes.length).toBeGreaterThan(1);
    const remaining = (await listQueuedAnalyticsEvents()).filter((e) => e.props?.marker === marker);
    expect(remaining).toHaveLength(0);
  });

  it("isolates a later batch's send failure: an earlier batch's already-confirmed removal is not undone (R3-002)", async () => {
    const marker = crypto.randomUUID();
    for (let i = 0; i < 55; i += 1) {
      await enqueueAnalyticsEvent({ name: "screen_view", props: { marker, i } });
    }
    let callCount = 0;
    const apiClient = fakeApiClient(async () => {
      callCount += 1;
      if (callCount === 2) throw new Error("simulated network failure on the second batch");
      return new Response(JSON.stringify({ status: "accepted" }), { status: 202 });
    });

    await expect(flushAnalyticsQueue({ apiClient, sendBeacon: () => false })).rejects.toThrow();

    const remaining = (await listQueuedAnalyticsEvents()).filter((e) => e.props?.marker === marker);
    expect(remaining).toHaveLength(5);
  });

  it("leaves the queue intact when the apiClient.post fallback fails — never drops an unsent event", async () => {
    const marker = crypto.randomUUID();
    await enqueueAnalyticsEvent({ name: "push_opt_in", props: { marker } });
    const apiClient = fakeApiClient(async () => {
      throw new Error("simulated network failure");
    });

    await expect(flushAnalyticsQueue({ apiClient, sendBeacon: () => false })).rejects.toThrow();

    const remaining = (await listQueuedAnalyticsEvents()).filter((e) => e.props?.marker === marker);
    expect(remaining).toHaveLength(1);
  });
});
