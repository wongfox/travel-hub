import { describe, expect, it } from "vitest";
import {
  computeInitialPurgeAfter,
  DEFAULT_HANDOFF_GRACE_DAYS,
  DEFAULT_PRECHECKIN_RETENTION_DAYS,
  resolveRetentionConfig,
  tightenPurgeAfter,
} from "./retention.js";

describe("resolveRetentionConfig", () => {
  it("falls back to the dev/non-production defaults when no env values are provided", () => {
    const config = resolveRetentionConfig({});

    expect(config.retentionDays).toBe(DEFAULT_PRECHECKIN_RETENTION_DAYS);
    expect(config.handoffGraceMs).toBe(DEFAULT_HANDOFF_GRACE_DAYS * 24 * 60 * 60 * 1000);
  });

  it("honors explicit PRECHECKIN_RETENTION_DAYS and PRECHECKIN_HANDOFF_GRACE_DAYS", () => {
    const config = resolveRetentionConfig({
      PRECHECKIN_RETENTION_DAYS: 30,
      PRECHECKIN_HANDOFF_GRACE_DAYS: 2,
    });

    expect(config.retentionDays).toBe(30);
    expect(config.handoffGraceMs).toBe(2 * 24 * 60 * 60 * 1000);
  });
});

describe("computeInitialPurgeAfter", () => {
  it("computes trip end + retention days as an ISO timestamp", () => {
    const purgeAfter = computeInitialPurgeAfter("2026-01-01T00:00:00.000Z", {
      retentionDays: 10,
      handoffGraceMs: 0,
    });

    expect(purgeAfter).toBe("2026-01-11T00:00:00.000Z");
  });
});

describe("tightenPurgeAfter", () => {
  it("keeps the earlier of the current purge_after and a new candidate (handoff grace)", () => {
    const current = "2026-04-01T00:00:00.000Z"; // trip end + retention (far out)
    const candidate = "2026-01-10T00:00:00.000Z"; // handed_off_at + grace (sooner)

    expect(tightenPurgeAfter(current, candidate)).toBe(candidate);
  });

  it("never loosens purge_after when the candidate is later than the current value", () => {
    const current = "2026-01-10T00:00:00.000Z";
    const candidate = "2026-04-01T00:00:00.000Z";

    expect(tightenPurgeAfter(current, candidate)).toBe(current);
  });
});
