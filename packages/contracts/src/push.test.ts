import { describe, expect, it } from "vitest";
import {
  AlertSourcePolicySchema,
  PushSubscriptionRequestSchema,
  WebPushPayloadSchema,
} from "./push.js";

describe("PushSubscriptionRequestSchema", () => {
  it("accepts a standard Web Push subscription request body", () => {
    const body = {
      endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
      keys: { p256dh: "key-p256dh", auth: "key-auth" },
      locale: "es",
    };

    expect(PushSubscriptionRequestSchema.parse(body)).toEqual(body);
  });

  it("rejects a subscription whose endpoint is not a URL", () => {
    expect(() =>
      PushSubscriptionRequestSchema.parse({
        endpoint: "not-a-url",
        keys: { p256dh: "key-p256dh", auth: "key-auth" },
        locale: "en",
      }),
    ).toThrow();
  });
});

describe("WebPushPayloadSchema", () => {
  it("accepts a push payload for a relocation alert", () => {
    const payload = {
      type: "RELOCATION",
      titleKey: "push.relocation.title",
      bodyKey: "push.relocation.body",
      url: "/trip",
      locale: "pt",
    };

    expect(WebPushPayloadSchema.parse(payload)).toEqual(payload);
  });

  it("rejects a payload with an alert type outside DELAY, RELOCATION, INCIDENT", () => {
    expect(() =>
      WebPushPayloadSchema.parse({
        type: "PULSE_PROMPT",
        titleKey: "x",
        bodyKey: "y",
        url: "/trip",
        locale: "es",
      }),
    ).toThrow();
  });
});

describe("AlertSourcePolicySchema", () => {
  it("accepts a policy declaring the official push source for every alert type", () => {
    const policy = {
      DELAY: { pushIsOfficialSource: false },
      RELOCATION: { pushIsOfficialSource: true },
      INCIDENT: { pushIsOfficialSource: true },
    };

    expect(AlertSourcePolicySchema.parse(policy)).toEqual(policy);
  });

  it("rejects a policy that omits an alert type, since every type needs a source decision", () => {
    expect(() =>
      AlertSourcePolicySchema.parse({
        DELAY: { pushIsOfficialSource: false },
        RELOCATION: { pushIsOfficialSource: true },
      }),
    ).toThrow();
  });
});
