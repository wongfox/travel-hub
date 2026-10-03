import { describe, expect, it } from "vitest";
import { createInMemoryConsentStore } from "./consent-store.js";

describe("createInMemoryConsentStore", () => {
  it("returns null when no consent has ever been recorded for a purpose", async () => {
    const store = createInMemoryConsentStore();

    const latest = await store.findLatest("RES-1001", null, "precheckin_biometric");

    expect(latest).toBeNull();
  });

  it("records a consent and returns it as the latest for its purpose", async () => {
    const store = createInMemoryConsentStore();

    const recorded = await store.record({
      linkId: "link-1",
      reservationRef: "RES-1001",
      passengerRef: null,
      purpose: "precheckin_biometric",
      textVersion: "v1",
      granted: true,
    });

    expect(recorded.granted).toBe(true);
    expect(recorded.id).toBeTruthy();
    expect(recorded.recordedAt).toBeTruthy();

    const latest = await store.findLatest("RES-1001", null, "precheckin_biometric");
    expect(latest).toEqual(recorded);
  });

  it("is append-only: withdrawing consent adds a new row rather than mutating the granted one", async () => {
    const store = createInMemoryConsentStore();

    await store.record({
      linkId: "link-1",
      reservationRef: "RES-1001",
      passengerRef: null,
      purpose: "pulse",
      textVersion: "v1",
      granted: true,
    });
    await store.record({
      linkId: "link-1",
      reservationRef: "RES-1001",
      passengerRef: null,
      purpose: "pulse",
      textVersion: "v1",
      granted: false,
    });

    const latest = await store.findLatest("RES-1001", null, "pulse");
    expect(latest?.granted).toBe(false);
  });

  it("latest-per-purpose wins: the most recently recorded row for a purpose is returned, not the first", async () => {
    const store = createInMemoryConsentStore();

    await store.record({
      linkId: "link-1",
      reservationRef: "RES-1001",
      passengerRef: null,
      purpose: "analytics",
      textVersion: "v1",
      granted: false,
    });
    const second = await store.record({
      linkId: "link-1",
      reservationRef: "RES-1001",
      passengerRef: null,
      purpose: "analytics",
      textVersion: "v2",
      granted: true,
    });

    const latest = await store.findLatest("RES-1001", null, "analytics");
    expect(latest).toEqual(second);
  });

  it("scopes lookups independently per reservation, passengerRef, and purpose", async () => {
    const store = createInMemoryConsentStore();

    await store.record({
      linkId: "link-1",
      reservationRef: "RES-1001",
      passengerRef: null,
      purpose: "precheckin_biometric",
      textVersion: "v1",
      granted: true,
    });

    expect(await store.findLatest("RES-2002", null, "precheckin_biometric")).toBeNull();
    expect(await store.findLatest("RES-1001", "P1", "precheckin_biometric")).toBeNull();
    expect(await store.findLatest("RES-1001", null, "push")).toBeNull();
  });

  it("listLatestByPurpose returns the latest record per reservation for that purpose only", async () => {
    const store = createInMemoryConsentStore();
    const base = { linkId: "link-1", passengerRef: null, textVersion: "v1" } as const;
    await store.record({ ...base, reservationRef: "RES-1", purpose: "analytics", granted: true });
    await store.record({ ...base, reservationRef: "RES-1", purpose: "analytics", granted: false });
    await store.record({ ...base, reservationRef: "RES-2", purpose: "analytics", granted: true });
    await store.record({ ...base, reservationRef: "RES-3", purpose: "push", granted: true });

    const latest = await store.listLatestByPurpose("analytics");

    expect(latest.map((r) => [r.reservationRef, r.granted]).sort()).toEqual([
      ["RES-1", false],
      ["RES-2", true],
    ]);
  });
});
