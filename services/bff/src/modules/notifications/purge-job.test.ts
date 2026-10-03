import { afterEach, describe, expect, it, vi } from "vitest";
import { createInMemoryPushSubscriptionStore } from "./push-subscription-store.js";
import { createInMemoryPiiAccessAudit } from "../../infra/audit/pii-access-audit.js";
import { runPushSubscriptionPurgeJob } from "./purge-job.js";
import { schedulePushSubscriptionPurge, PUSH_SUBSCRIPTION_PURGE_QUEUE } from "./purge-job.js";

const INPUT = {
  linkId: "link-1",
  reservationRef: "RES-1001",
  passengerScope: [] as string[],
  endpoint: "https://push.example.com/endpoint-1",
  p256dh: "p256dh-1",
  auth: "auth-1",
  locale: "es" as const,
  consentRecordId: "consent-1",
  expiresAt: "2026-11-05T00:00:00.000Z",
};

describe("runPushSubscriptionPurgeJob", () => {
  it("deletes every expired subscription and leaves active ones untouched", async () => {
    const store = createInMemoryPushSubscriptionStore();
    const expired = await store.create(INPUT);
    const active = await store.create({ ...INPUT, endpoint: "https://push.example.com/endpoint-active", expiresAt: "2027-01-01T00:00:00.000Z" });
    const piiAccessAudit = createInMemoryPiiAccessAudit();

    const result = await runPushSubscriptionPurgeJob({
      subscriptionStore: store,
      piiAccessAudit,
      now: () => new Date("2026-12-01T00:00:00.000Z"),
    });

    expect(result.purged).toBe(1);
    expect(await store.findById(expired.id)).toBeNull();
    expect(await store.findById(active.id)).not.toBeNull();
  });

  it("writes a pii_access_audit purge entry for every purged subscription", async () => {
    const store = createInMemoryPushSubscriptionStore();
    const expired = await store.create(INPUT);
    const piiAccessAudit = createInMemoryPiiAccessAudit();

    await runPushSubscriptionPurgeJob({ subscriptionStore: store, piiAccessAudit, now: () => new Date("2026-12-01T00:00:00.000Z") });

    expect(piiAccessAudit.entries).toHaveLength(1);
    expect(piiAccessAudit.entries[0]).toMatchObject({
      action: "purge",
      subjectType: "push_subscription",
      subjectId: expired.id,
    });
  });

  it("isolates one subscription's purge failure from another's — a real try/catch per item, not just a doc comment", async () => {
    const store = createInMemoryPushSubscriptionStore();
    const willFail = await store.create(INPUT);
    const willSucceed = await store.create({ ...INPUT, endpoint: "https://push.example.com/endpoint-2" });
    const piiAccessAudit = createInMemoryPiiAccessAudit();
    const failingStore = {
      ...store,
      async deleteById(id: string) {
        if (id === willFail.id) throw new Error("simulated delete failure");
        return store.deleteById(id);
      },
    };

    const result = await runPushSubscriptionPurgeJob({
      subscriptionStore: failingStore,
      piiAccessAudit,
      now: () => new Date("2026-12-01T00:00:00.000Z"),
    });

    expect(result.purged).toBe(1);
    expect(result.failed).toBe(1);
    expect(await store.findById(willSucceed.id)).toBeNull();
    expect(await store.findById(willFail.id)).not.toBeNull();
  });
});

describe("schedulePushSubscriptionPurge", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("enqueues an idempotent scan for its queue on every tick, defaults to 3600000 ms, and stops when asked", async () => {
    vi.useFakeTimers();
    const sendIdempotent = vi.fn().mockResolvedValue(undefined);

    const stop = schedulePushSubscriptionPurge({ sendIdempotent }, { intervalMs: 1000 });
    expect(sendIdempotent).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(sendIdempotent).toHaveBeenCalledTimes(1);
    expect(sendIdempotent).toHaveBeenCalledWith(PUSH_SUBSCRIPTION_PURGE_QUEUE, "scan", {});

    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(sendIdempotent).toHaveBeenCalledTimes(1);

    const stopDefault = schedulePushSubscriptionPurge({ sendIdempotent });
    await vi.advanceTimersByTimeAsync(3600000 - 1);
    expect(sendIdempotent).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sendIdempotent).toHaveBeenCalledTimes(2);
    stopDefault();
  });
});
