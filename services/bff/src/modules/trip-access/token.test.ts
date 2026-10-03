import { describe, expect, it } from "vitest";
import { generateAccessToken, hashAccessToken } from "./token.js";

describe("generateAccessToken", () => {
  it("generates a base64url token encoding 32 random bytes, per design Decision 4", () => {
    const token = generateAccessToken();

    // 32 bytes base64url-encoded, no padding, is 43 characters long.
    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("generates a different token on every call (not a fixed fake)", () => {
    const first = generateAccessToken();
    const second = generateAccessToken();

    expect(first).not.toBe(second);
  });
});

describe("hashAccessToken", () => {
  it("hashes a token deterministically as SHA-256 hex, per design Decision 4", () => {
    const token = "example-token-value";

    const first = hashAccessToken(token);
    const second = hashAccessToken(token);

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces a different hash for a different token", () => {
    expect(hashAccessToken("token-a")).not.toBe(hashAccessToken("token-b"));
  });

  it("never returns the raw token itself as the hash (the raw token must never be stored)", () => {
    const token = "some-raw-token";

    expect(hashAccessToken(token)).not.toBe(token);
  });
});
