import { describe, expect, it } from "vitest";
import { createInMemoryRateLimiter } from "./rate-limiter.js";

describe("createInMemoryRateLimiter", () => {
  it("allows attempts up to the configured max within the window", () => {
    const limiter = createInMemoryRateLimiter({ max: 3, windowMs: 60_000 });

    expect(limiter.consume("ip-1")).toBe(true);
    expect(limiter.consume("ip-1")).toBe(true);
    expect(limiter.consume("ip-1")).toBe(true);
  });

  it("blocks an attempt beyond the configured max within the same window", () => {
    const limiter = createInMemoryRateLimiter({ max: 2, windowMs: 60_000 });

    expect(limiter.consume("ip-2")).toBe(true);
    expect(limiter.consume("ip-2")).toBe(true);
    expect(limiter.consume("ip-2")).toBe(false);
  });

  it("keeps rejecting further attempts once blocked, within the same window", () => {
    const limiter = createInMemoryRateLimiter({ max: 1, windowMs: 60_000 });

    expect(limiter.consume("ip-3")).toBe(true);
    expect(limiter.consume("ip-3")).toBe(false);
    expect(limiter.consume("ip-3")).toBe(false);
  });

  it("allows attempts again once the window has fully elapsed", () => {
    let now = 0;
    const limiter = createInMemoryRateLimiter({ max: 1, windowMs: 1_000, now: () => now });

    expect(limiter.consume("ip-4")).toBe(true);
    expect(limiter.consume("ip-4")).toBe(false);

    now = 1_001;
    expect(limiter.consume("ip-4")).toBe(true);
  });

  it("tracks separate keys (sources) independently", () => {
    const limiter = createInMemoryRateLimiter({ max: 1, windowMs: 60_000 });

    expect(limiter.consume("ip-a")).toBe(true);
    expect(limiter.consume("ip-b")).toBe(true);
    expect(limiter.consume("ip-a")).toBe(false);
    expect(limiter.consume("ip-b")).toBe(false);
  });
});
