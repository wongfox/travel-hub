import { afterEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { hasAnalyticsConsentGranted, setAnalyticsConsentGranted } from "./analytics-consent.js";
import { enqueueAnalyticsEvent, listQueuedAnalyticsEvents } from "./analytics-queue-store.js";

afterEach(() => {
  localStorage.clear();
});

describe("analytics-consent", () => {
  it("defaults to not granted when nothing has ever been set", () => {
    expect(hasAnalyticsConsentGranted()).toBe(false);
  });

  it("reflects granted after setAnalyticsConsentGranted(true)", async () => {
    await setAnalyticsConsentGranted(true);

    expect(hasAnalyticsConsentGranted()).toBe(true);
  });

  it("reflects withdrawn after setAnalyticsConsentGranted(false), even after having been granted (task 12.3)", async () => {
    await setAnalyticsConsentGranted(true);
    await setAnalyticsConsentGranted(false);

    expect(hasAnalyticsConsentGranted()).toBe(false);
  });

  it("withdrawing consent also clears the queued IndexedDB events, so they can never be flushed later", async () => {
    await setAnalyticsConsentGranted(true);
    await enqueueAnalyticsEvent({ name: "screen_view" });
    expect(await listQueuedAnalyticsEvents()).not.toHaveLength(0);

    await setAnalyticsConsentGranted(false);

    expect(await listQueuedAnalyticsEvents()).toHaveLength(0);
  });
});
