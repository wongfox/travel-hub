import { describe, expect, it } from "vitest";
import {
  AnalyticsEventNameSchema,
  AnalyticsEventSchema,
  ClientAnalyticsEventNameSchema,
  ServerAnalyticsEventNameSchema,
  SendAnalyticsEventsRequestSchema,
} from "./analytics.js";

describe("analytics event name split", () => {
  it.each(ServerAnalyticsEventNameSchema.options)("rejects the server-only name %s from the client-submittable schema", (name) => {
    expect(ClientAnalyticsEventNameSchema.safeParse(name).success).toBe(false);
    expect(AnalyticsEventSchema.safeParse({ name }).success).toBe(false);
  });

  it("keeps every server-only name valid for the server-side recorder's full name schema", () => {
    for (const name of ServerAnalyticsEventNameSchema.options) {
      expect(AnalyticsEventNameSchema.safeParse(name).success).toBe(true);
    }
    expect(AnalyticsEventNameSchema.safeParse("screen_view").success).toBe(true);
  });

  it("lets a client submit only client names", () => {
    expect(AnalyticsEventSchema.safeParse({ name: "screen_view" }).success).toBe(true);
  });
});

describe("AnalyticsEventSchema", () => {
  it("accepts a minimal event with just a known name", () => {
    const result = AnalyticsEventSchema.safeParse({ name: "screen_view" });
    expect(result.success).toBe(true);
  });

  it("accepts an event with occurredAt and props", () => {
    const result = AnalyticsEventSchema.safeParse({
      name: "screen_view",
      occurredAt: "2026-11-02T08:00:00.000Z",
      props: { packageId: "WIFI-60" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown event name", () => {
    const result = AnalyticsEventSchema.safeParse({ name: "not_a_real_event" });
    expect(result.success).toBe(false);
  });

  it.each([
    ["a PII-shaped key name", { reservationRef: "RES-1001" }],
    ["a nested object value, where PII could hide from a shape-level check", { metadata: { email: "ana@example.com" } }],
    ["an overlong string value", { note: "x".repeat(201) }],
  ])("rejects props with %s (R1-002)", (_label, props) => {
    const result = AnalyticsEventSchema.safeParse({ name: "screen_view", props });
    expect(result.success).toBe(false);
  });

  it("accepts a short primitive prop value under a non-PII-shaped key", () => {
    const result = AnalyticsEventSchema.safeParse({
      name: "screen_view",
      props: { packageId: "WIFI-60", durationMinutes: 60, isRenewal: false },
    });
    expect(result.success).toBe(true);
  });
});

describe("SendAnalyticsEventsRequestSchema", () => {
  it("accepts a batch of 1-50 events", () => {
    const result = SendAnalyticsEventsRequestSchema.safeParse({
      events: [{ name: "screen_view" }, { name: "screen_view" }],
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
