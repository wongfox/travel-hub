import { describe, expect, it } from "vitest";
import { createInMemoryAnalyticsEventStore } from "./analytics-event-store.js";
import { createInMemoryConsentStore } from "../privacy/consent-store.js";
import { ConsentRequiredError } from "../privacy/consent-guard.js";
import { recordAnalyticsEvents } from "./record-analytics-events.js";

async function grantAnalyticsConsent(consentStore: ReturnType<typeof createInMemoryConsentStore>) {
  await consentStore.record({
    linkId: "link-1",
    reservationRef: "RES-1001",
    passengerRef: null,
    purpose: "analytics",
    textVersion: "v1",
    granted: true,
  });
}

describe("recordAnalyticsEvents", () => {
  it("rejects with ConsentRequiredError when no analytics consent is on file, and persists nothing", async () => {
    const analyticsEventStore = createInMemoryAnalyticsEventStore();
    const consentStore = createInMemoryConsentStore();

    await expect(
      recordAnalyticsEvents(
        { reservationRef: "RES-1001", events: [{ name: "screen_view" }] },
        { analyticsEventStore, consentStore, secret: "secret-1" },
      ),
    ).rejects.toBeInstanceOf(ConsentRequiredError);

    expect(await analyticsEventStore.list()).toHaveLength(0);
  });

  it("persists every event in the batch, pseudonymized, once analytics consent is granted", async () => {
    const analyticsEventStore = createInMemoryAnalyticsEventStore();
    const consentStore = createInMemoryConsentStore();
    await grantAnalyticsConsent(consentStore);

    const result = await recordAnalyticsEvents(
      {
        reservationRef: "RES-1001",
        events: [{ name: "screen_view" }, { name: "screen_view", props: { placement: "home_banner" } }],
      },
      { analyticsEventStore, consentStore, secret: "secret-1" },
    );

    expect(result.recorded).toBe(2);
    const all = await analyticsEventStore.list();
    expect(all).toHaveLength(2);
    expect(all.every((record) => !("reservationRef" in record))).toBe(true);
    expect(new Set(all.map((record) => record.tripHash)).size).toBe(1);
  });

  it("hands the whole batch to the store in ONE atomic createMany call, so a failure persists nothing and a retry cannot duplicate a partial batch", async () => {
    const consentStore = createInMemoryConsentStore();
    await grantAnalyticsConsent(consentStore);
    const batches: unknown[][] = [];
    const analyticsEventStore = {
      async createMany(inputs: unknown[]): Promise<never> {
        batches.push(inputs);
        throw new Error("simulated store failure");
      },
    };

    await expect(
      recordAnalyticsEvents(
        { reservationRef: "RES-1001", events: [{ name: "screen_view" }, { name: "screen_view" }, { name: "screen_view" }] },
        { analyticsEventStore, consentStore, secret: "secret-1" },
      ),
    ).rejects.toThrow(/simulated store failure/);

    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(3);
  });
});
