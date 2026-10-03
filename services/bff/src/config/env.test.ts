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
});
