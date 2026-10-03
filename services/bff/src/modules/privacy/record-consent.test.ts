import { describe, expect, it } from "vitest";
import { createInMemoryConsentStore } from "./consent-store.js";
import { createInMemoryPushSubscriptionStore } from "../notifications/push-subscription-store.js";
import { createInMemoryPiiAccessAudit } from "../../infra/audit/pii-access-audit.js";
import { recordConsent } from "./record-consent.js";
import { createInMemoryAnalyticsEventStore } from "../analytics/analytics-event-store.js";
import { computeTripHash } from "../analytics/trip-hash.js";

describe("recordConsent", () => {
  it("appends a consent record and returns it as a ConsentState", async () => {
    const store = createInMemoryConsentStore();

    const result = await recordConsent(
      { linkId: "link-1", reservationRef: "RES-1001", purpose: "precheckin_biometric", textVersion: "v1", granted: true },
      { consentStore: store },
    );

    expect(result).toEqual({
      purpose: "precheckin_biometric",
      granted: true,
      textVersion: "v1",
      recordedAt: expect.any(String),
      recordId: expect.any(String),
    });
  });

  it("persists the record at reservation scope (passengerRef null) so a later lookup finds it", async () => {
    const store = createInMemoryConsentStore();

    await recordConsent(
      { linkId: "link-1", reservationRef: "RES-1001", purpose: "push", textVersion: "v2", granted: false },
      { consentStore: store },
    );

    const latest = await store.findLatest("RES-1001", null, "push");
    expect(latest?.granted).toBe(false);
    expect(latest?.linkId).toBe("link-1");
  });

  it("withdrawing push consent deletes every push subscription for that reservation IMMEDIATELY — in this same call, not on a later scheduled purge run (task 12.3, RED-worthy)", async () => {
    const store = createInMemoryConsentStore();
    const pushSubscriptionStore = createInMemoryPushSubscriptionStore();
    const subscription = await pushSubscriptionStore.create({
      linkId: "link-1",
      reservationRef: "RES-1001",
      passengerScope: [],
      endpoint: "https://push.example.com/endpoint-1",
      p256dh: "p256dh-1",
      auth: "auth-1",
      locale: "es",
      consentRecordId: "consent-0",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });

    await recordConsent(
      { linkId: "link-1", reservationRef: "RES-1001", purpose: "push", textVersion: "v1", granted: false },
      { consentStore: store, pushSubscriptionStore },
    );

    // No purge job of any kind ran here — the deletion above is the ONLY
    // thing that could have removed it, proving immediacy, not "eventually".
    expect(await pushSubscriptionStore.findById(subscription.id)).toBeNull();
  });

  it("granting push consent (granted: true) never triggers the withdrawal cascade", async () => {
    const store = createInMemoryConsentStore();
    const pushSubscriptionStore = createInMemoryPushSubscriptionStore();
    const subscription = await pushSubscriptionStore.create({
      linkId: "link-1",
      reservationRef: "RES-1001",
      passengerScope: [],
      endpoint: "https://push.example.com/endpoint-1",
      p256dh: "p256dh-1",
      auth: "auth-1",
      locale: "es",
      consentRecordId: "consent-0",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });

    await recordConsent(
      { linkId: "link-1", reservationRef: "RES-1001", purpose: "push", textVersion: "v1", granted: true },
      { consentStore: store, pushSubscriptionStore },
    );

    expect(await pushSubscriptionStore.findById(subscription.id)).not.toBeNull();
  });

  it("withdrawing a non-push purpose (e.g. pulse) never touches push subscriptions", async () => {
    const store = createInMemoryConsentStore();
    const pushSubscriptionStore = createInMemoryPushSubscriptionStore();
    const subscription = await pushSubscriptionStore.create({
      linkId: "link-1",
      reservationRef: "RES-1001",
      passengerScope: [],
      endpoint: "https://push.example.com/endpoint-1",
      p256dh: "p256dh-1",
      auth: "auth-1",
      locale: "es",
      consentRecordId: "consent-0",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });

    await recordConsent(
      { linkId: "link-1", reservationRef: "RES-1001", purpose: "pulse", textVersion: "v1", granted: false },
      { consentStore: store, pushSubscriptionStore },
    );

    expect(await pushSubscriptionStore.findById(subscription.id)).not.toBeNull();
  });

  it("withdrawing push consent twice in a row is a harmless no-op the second time (idempotent cascade)", async () => {
    const store = createInMemoryConsentStore();
    const pushSubscriptionStore = createInMemoryPushSubscriptionStore();

    await recordConsent(
      { linkId: "link-1", reservationRef: "RES-1001", purpose: "push", textVersion: "v1", granted: false },
      { consentStore: store, pushSubscriptionStore },
    );

    await expect(
      recordConsent(
        { linkId: "link-1", reservationRef: "RES-1001", purpose: "push", textVersion: "v1", granted: false },
        { consentStore: store, pushSubscriptionStore },
      ),
    ).resolves.toBeTruthy();
  });

  it("still succeeds and returns the already-recorded withdrawal when the cascade deletion itself fails, auditing the failure distinctly (R4-consent-cascade-partial-failure)", async () => {
    const store = createInMemoryConsentStore();
    const piiAccessAudit = createInMemoryPiiAccessAudit();
    const explodingPushSubscriptionStore = {
      async deleteByReservation(): Promise<void> {
        throw new Error("simulated transient store failure");
      },
    };

    const result = await recordConsent(
      { linkId: "link-1", reservationRef: "RES-1001", purpose: "push", textVersion: "v1", granted: false },
      { consentStore: store, pushSubscriptionStore: explodingPushSubscriptionStore, piiAccessAudit },
    );

    expect(result.granted).toBe(false);
    expect(await store.findLatest("RES-1001", null, "push")).not.toBeNull();
    const failureEntries = piiAccessAudit.entries.filter((e) => e.action === "purge_failed");
    expect(failureEntries).toHaveLength(1);
    expect(failureEntries[0]?.subjectType).toBe("push_subscription");
  });

  it("still succeeds and returns the withdrawal when deletion succeeds but the audit write itself fails (R3-001)", async () => {
    const store = createInMemoryConsentStore();
    const pushSubscriptionStore = createInMemoryPushSubscriptionStore();
    const explodingPiiAccessAudit = {
      async record(): Promise<never> {
        throw new Error("simulated audit-store outage");
      },
    };

    const result = await recordConsent(
      { linkId: "link-1", reservationRef: "RES-1001", purpose: "push", textVersion: "v1", granted: false },
      { consentStore: store, pushSubscriptionStore, piiAccessAudit: explodingPiiAccessAudit },
    );

    expect(result.granted).toBe(false);
  });

  it("still records the consent withdrawal even when pushSubscriptionStore is omitted (backward compatible)", async () => {
    const store = createInMemoryConsentStore();

    const result = await recordConsent(
      { linkId: "link-1", reservationRef: "RES-1001", purpose: "push", textVersion: "v1", granted: false },
      { consentStore: store },
    );

    expect(result.granted).toBe(false);
  });

  it("withdrawing analytics consent deletes that reservation's not-yet-forwarded analytics rows in the same call, leaving other trips untouched", async () => {
    const consentStore = createInMemoryConsentStore();
    const analyticsEventStore = createInMemoryAnalyticsEventStore();
    const mine = computeTripHash("RES-1001", "secret");
    const theirs = computeTripHash("RES-2002", "secret");
    await analyticsEventStore.create({ name: "screen_view", tripHash: mine, occurredAt: "2026-10-01T00:00:00.000Z" });
    await analyticsEventStore.create({ name: "screen_view", tripHash: theirs, occurredAt: "2026-10-01T00:00:01.000Z" });

    await recordConsent(
      { linkId: "link-1", reservationRef: "RES-1001", purpose: "analytics", textVersion: "v1", granted: false },
      { consentStore, analyticsEventStore, analyticsSecret: "secret" },
    );

    expect((await analyticsEventStore.list()).map((r) => r.tripHash)).toEqual([theirs]);
  });

  it("granting analytics consent leaves analytics rows alone", async () => {
    const consentStore = createInMemoryConsentStore();
    const analyticsEventStore = createInMemoryAnalyticsEventStore();
    await analyticsEventStore.create({ name: "screen_view", tripHash: computeTripHash("RES-1001", "secret"), occurredAt: "2026-10-01T00:00:00.000Z" });

    await recordConsent(
      { linkId: "link-1", reservationRef: "RES-1001", purpose: "analytics", textVersion: "v1", granted: true },
      { consentStore, analyticsEventStore, analyticsSecret: "secret" },
    );

    expect(await analyticsEventStore.list()).toHaveLength(1);
  });
});
