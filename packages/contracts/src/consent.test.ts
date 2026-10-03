import { describe, expect, it } from "vitest";
import { ConsentPurposeSchema, ConsentStateSchema, RecordConsentRequestSchema } from "./consent.js";

describe("ConsentPurposeSchema", () => {
  it("accepts every consent purpose named in the design Data Model's consent_record table", () => {
    for (const purpose of ["analytics", "push", "pulse", "precheckin_biometric"] as const) {
      expect(ConsentPurposeSchema.parse(purpose)).toBe(purpose);
    }
  });

  it("rejects a purpose outside the four recorded categories", () => {
    expect(() => ConsentPurposeSchema.parse("marketing")).toThrow();
  });
});

describe("RecordConsentRequestSchema", () => {
  it("accepts a `POST /api/consents` request granting a purpose", () => {
    const body = { purpose: "push", textVersion: "v1", granted: true };
    expect(RecordConsentRequestSchema.parse(body)).toEqual(body);
  });

  it("accepts a withdrawal (granted: false) for a different purpose, proving both branches are real", () => {
    const body = { purpose: "pulse", textVersion: "v2", granted: false };
    const parsed = RecordConsentRequestSchema.parse(body);
    expect(parsed.granted).toBe(false);
    expect(parsed.purpose).toBe("pulse");
  });
});

describe("ConsentStateSchema", () => {
  it("round-trips the latest recorded consent state for a purpose", () => {
    const state = {
      purpose: "precheckin_biometric",
      granted: true,
      textVersion: "v3",
      recordedAt: "2026-09-30T12:00:00.000Z",
    };

    expect(ConsentStateSchema.parse(state)).toEqual(state);
  });
});
