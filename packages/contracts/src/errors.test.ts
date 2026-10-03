import { describe, expect, it } from "vitest";
import { ErrorCodeSchema, ErrorEnvelopeSchema } from "./errors.js";

describe("ErrorCodeSchema", () => {
  it("accepts every error code named in design-interfaces' HTTP surface", () => {
    const knownCodes = [
      "link_expired",
      "link_revoked",
      "feature_disabled",
      "consent_required",
      "out_of_scope",
      "sir_unavailable",
      "payment_failed",
      "already_submitted",
    ] as const;

    for (const code of knownCodes) {
      expect(ErrorCodeSchema.parse(code)).toBe(code);
    }
  });

  it("rejects a code that is not part of the documented error surface", () => {
    expect(() => ErrorCodeSchema.parse("internal_error")).toThrow();
  });
});

describe("ErrorEnvelopeSchema", () => {
  it("accepts a well-formed { code, requestId } envelope", () => {
    const parsed = ErrorEnvelopeSchema.parse({
      code: "link_expired",
      requestId: "req_01HXYZ",
    });

    expect(parsed).toEqual({ code: "link_expired", requestId: "req_01HXYZ" });
  });

  it("rejects an envelope carrying an unknown error code", () => {
    expect(() =>
      ErrorEnvelopeSchema.parse({ code: "not_a_code", requestId: "req_1" }),
    ).toThrow();
  });

  it("rejects an envelope missing requestId", () => {
    expect(() => ErrorEnvelopeSchema.parse({ code: "payment_failed" })).toThrow();
  });
});
