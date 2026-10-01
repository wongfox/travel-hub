import { describe, expect, it } from "vitest";
import { DEFAULT_NEGATIVE_PULSE_RULE, evaluateNegativePulseRule } from "./negative-pulse-rule.js";

describe("evaluateNegativePulseRule", () => {
  it("classifies a score at or below the configured threshold as negative", () => {
    const rule = { scoreThreshold: 2 };

    expect(evaluateNegativePulseRule({ score: 1, hasReturnLegPending: false }, rule)).toBe(true);
    expect(evaluateNegativePulseRule({ score: 2, hasReturnLegPending: false }, rule)).toBe(true);
  });

  it("classifies a score above the configured threshold as not negative", () => {
    const rule = { scoreThreshold: 2 };

    expect(evaluateNegativePulseRule({ score: 3, hasReturnLegPending: false }, rule)).toBe(false);
    expect(evaluateNegativePulseRule({ score: 5, hasReturnLegPending: false }, rule)).toBe(false);
  });

  it("honors onlyWhenReturnLegPending: a negative score with no return leg pending is not negative when the rule requires one", () => {
    const rule = { scoreThreshold: 2, onlyWhenReturnLegPending: true };

    expect(evaluateNegativePulseRule({ score: 1, hasReturnLegPending: false }, rule)).toBe(false);
    expect(evaluateNegativePulseRule({ score: 1, hasReturnLegPending: true }, rule)).toBe(true);
  });

  it("DEFAULT_NEGATIVE_PULSE_RULE does not require a pending return leg", () => {
    expect(evaluateNegativePulseRule({ score: 1, hasReturnLegPending: false }, DEFAULT_NEGATIVE_PULSE_RULE)).toBe(
      true,
    );
  });
});
