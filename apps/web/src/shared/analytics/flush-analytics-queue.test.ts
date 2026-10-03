import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApiClient } from "../api/client.js";
import { enqueueAnalyticsEvent, listQueuedAnalyticsEvents } from "./analytics-queue-store.js";
import { flushAnalyticsQueue } from "./flush-analytics-queue.js";
import { setAnalyticsConsentGranted } from "./analytics-consent.js";

beforeEach(async () => {
  await setAnalyticsConsentGranted(true);
});

afterEach(async () => {
  await setAnalyticsConsentGranted(false);
});

function errorResponse(status: number, code: string): Response {
  return new Response(JSON.stringify({ code, requestId: "req-1" }), { status });
}

function fakeApiClient(fetchImpl: typeof fetch) {
  return createApiClient({ fetchImpl });
}

describe("flushAnalyticsQueue", () => {
  it("is a no-op (skipped: true) when nothing is queued", async () => {
    const apiClient = fakeApiClient(async () => new Response(null, { status: 204 }));

    const result = await flushAnalyticsQueue({ apiClient });

    expect(result).toEqual({ sent: 0, dropped: 0, skipped: true });
  });

  it("sends with fetch keepalive (observable success) and clears the queue only after a successful response", async () => {
    const marker = crypto.randomUUID();
    await enqueueAnalyticsEvent({ name: "screen_view", props: { marker } });
    const inits: (RequestInit | undefined)[] = [];
    const apiClient = fakeApiClient(async (_url, init) => {
      inits.push(init);
      return new Response(JSON.stringify({ status: "accepted" }), { status: 202 });
    });

    const result = await flushAnalyticsQueue({ apiClient });

    expect(result.sent).toBeGreaterThan(0);
    expect(inits).toHaveLength(1);
    expect(inits[0]?.keepalive).toBe(true);
    const remaining = (await listQueuedAnalyticsEvents()).filter((e) => e.props?.marker === marker);
    expect(remaining).toHaveLength(0);
  });

  it("never deletes rows on a beacon hand-off: a flush with only navigator.sendBeacon available still needs a confirmed response", async () => {
    const marker = crypto.randomUUID();
    await enqueueAnalyticsEvent({ name: "screen_view", props: { marker } });
    let beaconCalled = false;
    const originalBeacon = Object.getOwnPropertyDescriptor(navigator, "sendBeacon");
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: () => {
        beaconCalled = true;
        return true;
      },
    });
    try {
      const apiClient = fakeApiClient(async () => {
        throw new Error("simulated network failure");
      });

      await expect(flushAnalyticsQueue({ apiClient })).rejects.toThrow();

      expect(beaconCalled).toBe(false);
      const remaining = (await listQueuedAnalyticsEvents()).filter((e) => e.props?.marker === marker);
      expect(remaining).toHaveLength(1);
    } finally {
      if (originalBeacon) Object.defineProperty(navigator, "sendBeacon", originalBeacon);
      else delete (navigator as unknown as Record<string, unknown>).sendBeacon;
    }
  });

  it("sends nothing and discards the queue when analytics consent is no longer granted", async () => {
    const marker = crypto.randomUUID();
    await enqueueAnalyticsEvent({ name: "screen_view", props: { marker } });
    localStorage.clear();
    let called = false;
    const apiClient = fakeApiClient(async () => {
      called = true;
      return new Response(null, { status: 202 });
    });

    const result = await flushAnalyticsQueue({ apiClient });

    expect(called).toBe(false);
    expect(result.sent).toBe(0);
    expect(await listQueuedAnalyticsEvents()).toHaveLength(0);
  });

  it("drops a permanently rejected batch (400/403) so it cannot block later events, and reports it as dropped", async () => {
    const marker = crypto.randomUUID();
    for (let i = 0; i < 55; i += 1) {
      await enqueueAnalyticsEvent({ name: "screen_view", props: { marker, i } });
    }
    let callCount = 0;
    const apiClient = fakeApiClient(async () => {
      callCount += 1;
      return callCount === 1 ? errorResponse(400, "invalid_request") : new Response(JSON.stringify({ status: "accepted" }), { status: 202 });
    });

    const result = await flushAnalyticsQueue({ apiClient });

    expect(result).toMatchObject({ sent: 5, dropped: 50, skipped: false });
    expect((await listQueuedAnalyticsEvents()).filter((e) => e.props?.marker === marker)).toHaveLength(0);
  });

  it.each([
    [429, "invalid_request"],
    [408, "invalid_request"],
    [503, "sir_unavailable"],
  ])("keeps the queue on a transient %i response so a later flush retries", async (status, code) => {
    const marker = crypto.randomUUID();
    await enqueueAnalyticsEvent({ name: "screen_view", props: { marker } });
    const apiClient = fakeApiClient(async () => errorResponse(status, code));

    await expect(flushAnalyticsQueue({ apiClient })).rejects.toThrow();

    expect((await listQueuedAnalyticsEvents()).filter((e) => e.props?.marker === marker)).toHaveLength(1);
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

    const result = await flushAnalyticsQueue({ apiClient });

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

    await expect(flushAnalyticsQueue({ apiClient })).rejects.toThrow();

    const remaining = (await listQueuedAnalyticsEvents()).filter((e) => e.props?.marker === marker);
    expect(remaining).toHaveLength(5);
  });

  it("leaves the queue intact when the apiClient.post fallback fails — never drops an unsent event", async () => {
    const marker = crypto.randomUUID();
    await enqueueAnalyticsEvent({ name: "push_opt_in", props: { marker } });
    const apiClient = fakeApiClient(async () => {
      throw new Error("simulated network failure");
    });

    await expect(flushAnalyticsQueue({ apiClient })).rejects.toThrow();

    const remaining = (await listQueuedAnalyticsEvents()).filter((e) => e.props?.marker === marker);
    expect(remaining).toHaveLength(1);
  });
});
