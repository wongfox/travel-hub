import { describe, expect, it } from "vitest";
import { computeTripHash } from "./trip-hash.js";

describe("computeTripHash", () => {
  it("is deterministic for the same reservationRef and secret", () => {
    const a = computeTripHash("RES-1001", "secret-1");
    const b = computeTripHash("RES-1001", "secret-1");
    expect(a).toBe(b);
  });

  it("produces different hashes for different reservation refs under the same secret", () => {
    const a = computeTripHash("RES-1001", "secret-1");
    const b = computeTripHash("RES-1002", "secret-1");
    expect(a).not.toBe(b);
  });

  it("produces different hashes for the same reservationRef under different secrets", () => {
    const a = computeTripHash("RES-1001", "secret-1");
    const b = computeTripHash("RES-1001", "secret-2");
    expect(a).not.toBe(b);
  });

  it("never returns the raw reservationRef, and is a 64-char hex HMAC-SHA256 digest", () => {
    const hash = computeTripHash("RES-1001", "secret-1");
    expect(hash).not.toBe("RES-1001");
    expect(hash).not.toContain("RES-1001");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
