import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { enqueueAnalyticsEvent, listQueuedAnalyticsEvents, removeQueuedAnalyticsEvents } from "./analytics-queue-store.js";

// Same convention as `trip-snapshot-store.test.ts`/`trip-prefs-store.test.ts`:
// `getTravelHubDb()` never closes its connections (by design — see its own
// doc comment), so deleting the shared database between tests would hang
// waiting for those connections to close. Each test below uses its own
// distinguishing `props` marker and filters results instead of asserting a
// from-empty queue.

describe("analytics-queue-store", () => {
  it("enqueues an event and lists it back with a generated id", async () => {
    const marker = crypto.randomUUID();
    await enqueueAnalyticsEvent({ name: "screen_view", props: { marker } });

    const queued = (await listQueuedAnalyticsEvents()).filter((e) => e.props?.marker === marker);

    expect(queued).toHaveLength(1);
    expect(queued[0]?.id).toBeTruthy();
    expect(queued[0]?.name).toBe("screen_view");
    expect(typeof queued[0]?.occurredAt).toBe("string");
  });

  it("preserves insertion order across multiple enqueues sharing the same marker", async () => {
    const marker = crypto.randomUUID();
    await enqueueAnalyticsEvent({ name: "screen_view", props: { marker, step: "first" } });
    await enqueueAnalyticsEvent({ name: "screen_view", props: { marker, step: "second" } });

    const queued = (await listQueuedAnalyticsEvents()).filter((e) => e.props?.marker === marker);

    expect(queued.map((e) => e.props?.step)).toEqual(["first", "second"]);
  });

  it("removeQueuedAnalyticsEvents deletes only the given ids, leaving the rest queued", async () => {
    const marker = crypto.randomUUID();
    await enqueueAnalyticsEvent({ name: "screen_view", props: { marker } });
    await enqueueAnalyticsEvent({ name: "screen_view", props: { marker } });
    const [first, second] = (await listQueuedAnalyticsEvents()).filter((e) => e.props?.marker === marker);

    await removeQueuedAnalyticsEvents([first!.id]);

    const remaining = (await listQueuedAnalyticsEvents()).filter((e) => e.props?.marker === marker);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe(second!.id);
  });
});
