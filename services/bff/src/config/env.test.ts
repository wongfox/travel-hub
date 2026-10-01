import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

describe("loadEnv", () => {
  it("parses a valid environment and applies defaults for optional fields", () => {
    const env = loadEnv({
      DATABASE_URL: "postgres://user:pass@localhost:5432/travel_hub",
    });

    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(3000);
    expect(env.DATABASE_URL).toBe("postgres://user:pass@localhost:5432/travel_hub");
  });

  it("coerces and honors an explicitly provided PORT and NODE_ENV", () => {
    const env = loadEnv({
      NODE_ENV: "production",
      PORT: "8080",
      DATABASE_URL: "postgres://user:pass@localhost:5432/travel_hub",
    });

    expect(env.NODE_ENV).toBe("production");
    expect(env.PORT).toBe(8080);
  });

  it("throws when DATABASE_URL is missing", () => {
    expect(() => loadEnv({ NODE_ENV: "development" })).toThrow(/DATABASE_URL/);
  });

  it("throws when NODE_ENV is not one of the recognized environments", () => {
    expect(() =>
      loadEnv({ NODE_ENV: "not-a-real-env", DATABASE_URL: "postgres://x" }),
    ).toThrow();
  });

  it("leaves INTERNAL_LINKS_API_KEY undefined when not provided", () => {
    const env = loadEnv({ DATABASE_URL: "postgres://user:pass@localhost:5432/travel_hub" });

    expect(env.INTERNAL_LINKS_API_KEY).toBeUndefined();
  });

  it("passes through an explicitly configured INTERNAL_LINKS_API_KEY", () => {
    const env = loadEnv({
      DATABASE_URL: "postgres://user:pass@localhost:5432/travel_hub",
      INTERNAL_LINKS_API_KEY: "a-real-service-secret",
    });

    expect(env.INTERNAL_LINKS_API_KEY).toBe("a-real-service-secret");
  });

  it("defaults ADAPTER_PRECHECKIN_HANDOFF to 'stub' and leaves the other task 8.5 go-live fields undefined", () => {
    const env = loadEnv({ DATABASE_URL: "postgres://user:pass@localhost:5432/travel_hub" });

    expect(env.ADAPTER_PRECHECKIN_HANDOFF).toBe("stub");
    expect(env.PRECHECKIN_RETENTION_POLICY_ID).toBeUndefined();
    expect(env.PRECHECKIN_RETENTION_DAYS).toBeUndefined();
    expect(env.PRECHECKIN_CONSENT_TEXT_VERSION).toBeUndefined();
    expect(env.PRECHECKIN_KMS_KEY_ID).toBeUndefined();
    expect(env.PRECHECKIN_HANDOFF_GRACE_DAYS).toBeUndefined();
  });

  it("passes through explicitly configured task 8.5 go-live/retention fields, coercing numeric ones", () => {
    const env = loadEnv({
      DATABASE_URL: "postgres://user:pass@localhost:5432/travel_hub",
      ADAPTER_PRECHECKIN_HANDOFF: "s3",
      PRECHECKIN_RETENTION_POLICY_ID: "policy-1",
      PRECHECKIN_RETENTION_DAYS: "30",
      PRECHECKIN_CONSENT_TEXT_VERSION: "v1",
      PRECHECKIN_KMS_KEY_ID: "arn:aws:kms:us-east-1:123:key/abc",
      PRECHECKIN_HANDOFF_GRACE_DAYS: "3",
    });

    expect(env.ADAPTER_PRECHECKIN_HANDOFF).toBe("s3");
    expect(env.PRECHECKIN_RETENTION_POLICY_ID).toBe("policy-1");
    expect(env.PRECHECKIN_RETENTION_DAYS).toBe(30);
    expect(env.PRECHECKIN_CONSENT_TEXT_VERSION).toBe("v1");
    expect(env.PRECHECKIN_KMS_KEY_ID).toBe("arn:aws:kms:us-east-1:123:key/abc");
    expect(env.PRECHECKIN_HANDOFF_GRACE_DAYS).toBe(3);
  });

  it("defaults ADAPTER_CONTENT to 'stub' (task 9.1 go-live prerequisite)", () => {
    const env = loadEnv({ DATABASE_URL: "postgres://user:pass@localhost:5432/travel_hub" });

    expect(env.ADAPTER_CONTENT).toBe("stub");
  });

  it("passes through an explicitly configured ADAPTER_CONTENT", () => {
    const env = loadEnv({
      DATABASE_URL: "postgres://user:pass@localhost:5432/travel_hub",
      ADAPTER_CONTENT: "headless-cms",
    });

    expect(env.ADAPTER_CONTENT).toBe("headless-cms");
  });

  it("defaults ADAPTER_PAYMENT to 'stub' (task 10.1 go-live prerequisite)", () => {
    const env = loadEnv({ DATABASE_URL: "postgres://user:pass@localhost:5432/travel_hub" });

    expect(env.ADAPTER_PAYMENT).toBe("stub");
  });

  it("passes through an explicitly configured ADAPTER_PAYMENT", () => {
    const env = loadEnv({
      DATABASE_URL: "postgres://user:pass@localhost:5432/travel_hub",
      ADAPTER_PAYMENT: "a-real-gateway",
    });

    expect(env.ADAPTER_PAYMENT).toBe("a-real-gateway");
  });

  it("defaults ADAPTER_WEB_PUSH to 'stub' and leaves the other task 11.1 go-live fields undefined", () => {
    const env = loadEnv({ DATABASE_URL: "postgres://user:pass@localhost:5432/travel_hub" });

    expect(env.ADAPTER_WEB_PUSH).toBe("stub");
    expect(env.PUSH_VAPID_PUBLIC_KEY).toBeUndefined();
    expect(env.PUSH_VAPID_PRIVATE_KEY).toBeUndefined();
    expect(env.PUSH_CONSENT_TEXT_VERSION).toBeUndefined();
  });

  it("passes through explicitly configured task 11.1 go-live fields", () => {
    const env = loadEnv({
      DATABASE_URL: "postgres://user:pass@localhost:5432/travel_hub",
      ADAPTER_WEB_PUSH: "vapid",
      PUSH_VAPID_PUBLIC_KEY: "a-real-public-key",
      PUSH_VAPID_PRIVATE_KEY: "a-real-private-key",
      PUSH_CONSENT_TEXT_VERSION: "v1",
    });

    expect(env.ADAPTER_WEB_PUSH).toBe("vapid");
    expect(env.PUSH_VAPID_PUBLIC_KEY).toBe("a-real-public-key");
    expect(env.PUSH_VAPID_PRIVATE_KEY).toBe("a-real-private-key");
    expect(env.PUSH_CONSENT_TEXT_VERSION).toBe("v1");
  });
});
