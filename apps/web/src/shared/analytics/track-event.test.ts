import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { setAnalyticsConsentGranted } from "./analytics-consent.js";
import { listQueuedAnalyticsEvents } from "./analytics-queue-store.js";
import { trackEvent } from "./track-event.js";

afterEach(() => {
  localStorage.clear();
});

describe("trackEvent", () => {
  it("does nothing when analytics consent is not granted (the default state)", async () => {
    const marker = crypto.randomUUID();

    await trackEvent({ name: "screen_view", props: { marker } });

    const queued = (await listQueuedAnalyticsEvents()).filter((e) => e.props?.marker === marker);
    expect(queued).toHaveLength(0);
  });

  it("enqueues the event once consent is granted", async () => {
    await setAnalyticsConsentGranted(true);
    const marker = crypto.randomUUID();

    await trackEvent({ name: "screen_view", props: { marker } });

    const queued = (await listQueuedAnalyticsEvents()).filter((e) => e.props?.marker === marker);
    expect(queued).toHaveLength(1);
  });

  it("stops enqueueing and discards the queue once consent is withdrawn, even if it was granted a moment ago (task 12.3)", async () => {
    await setAnalyticsConsentGranted(true);
    const marker = crypto.randomUUID();
    await trackEvent({ name: "screen_view", props: { marker } });

    await setAnalyticsConsentGranted(false);
    await trackEvent({ name: "screen_view", props: { marker } });

    const queued = (await listQueuedAnalyticsEvents()).filter((e) => e.props?.marker === marker);
    // Withdrawal discards what was already queued too (it must never be flushed later).
    expect(queued).toEqual([]);
  });
});
