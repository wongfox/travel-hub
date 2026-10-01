import { describe, expect, it } from "vitest";
import { AnalyticsEventSchema, SendAnalyticsEventsRequestSchema } from "./analytics.js";

describe("AnalyticsEventSchema", () => {
  it("accepts a minimal event with just a known name", () => {
    const result = AnalyticsEventSchema.safeParse({ name: "screen_view" });
    expect(result.success).toBe(true);
  });

  it("accepts an event with occurredAt and props", () => {
    const result = AnalyticsEventSchema.safeParse({
      name: "wifi_package_selected",
      occurredAt: "2026-11-02T08:00:00.000Z",
      props: { packageId: "WIFI-60" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown event name", () => {
    const result = AnalyticsEventSchema.safeParse({ name: "not_a_real_event" });
    expect(result.success).toBe(false);
  });

  it("rejects a props key that resembles a PII field (R1-002)", () => {
    const result = AnalyticsEventSchema.safeParse({
      name: "wifi_package_selected",
      props: { reservationRef: "RES-1001" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a nested object/array value in props, where PII could hide from a shape-level check (R1-002)", () => {
    const result = AnalyticsEventSchema.safeParse({
      name: "wifi_package_selected",
      props: { metadata: { email: "ana@example.com" } },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an overlong string value in props (R1-002)", () => {
    const result = AnalyticsEventSchema.safeParse({
      name: "wifi_package_selected",
      props: { note: "x".repeat(201) },
    });
    expect(result.success).toBe(false);
  });

  it("accepts a short primitive prop value under a non-PII-shaped key", () => {
    const result = AnalyticsEventSchema.safeParse({
      name: "wifi_package_selected",
      props: { packageId: "WIFI-60", durationMinutes: 60, isRenewal: false },
    });
    expect(result.success).toBe(true);
  });
});

describe("SendAnalyticsEventsRequestSchema", () => {
  it("accepts a batch of 1-50 events", () => {
    const result = SendAnalyticsEventsRequestSchema.safeParse({
      events: [{ name: "screen_view" }, { name: "tfe_click_out" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty batch", () => {
    const result = SendAnalyticsEventsRequestSchema.safeParse({ events: [] });
    expect(result.success).toBe(false);
  });

  it("rejects a batch over the 50-event bound", () => {
    const result = SendAnalyticsEventsRequestSchema.safeParse({
      events: Array.from({ length: 51 }, () => ({ name: "screen_view" })),
    });
    expect(result.success).toBe(false);
  });
});
