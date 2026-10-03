/**
 * D4a's configurable negative-response rule (design Decision 12, spec
 * `experience-pulse` "Negative-response detection"): the exact threshold and
 * whether alerting is restricted to a pending-return-leg moment are
 * business decisions left TBD by the spec. `scoreThreshold: 2` here is a
 * concrete, documented default on the 1-5 faces scale (`PulseScoreSchema`) —
 * "the two lowest faces are negative" — not an invented business answer;
 * tune it via config once the business owner decides.
 */
export interface NegativePulseRule {
  /** A response scores negative when `score <= scoreThreshold`. */
  scoreThreshold: number;
  /** When `true`, a response only counts as negative while a return leg for the same reservation has not yet completed. Spec: "whether alerts fire only on the outbound leg when a return leg exists... TBD/configurable." */
  onlyWhenReturnLegPending?: boolean;
}

export const DEFAULT_NEGATIVE_PULSE_RULE: NegativePulseRule = { scoreThreshold: 2 };

export interface NegativePulseEvaluationInput {
  score: number;
  hasReturnLegPending: boolean;
}

/**
 * Pure classification function (task 11.5): evaluates one pulse response
 * against the configured `NegativePulseRule`.
 */
export function evaluateNegativePulseRule(input: NegativePulseEvaluationInput, rule: NegativePulseRule): boolean {
  if (input.score > rule.scoreThreshold) {
    return false;
  }
  if (rule.onlyWhenReturnLegPending && !input.hasReturnLegPending) {
    return false;
  }
  return true;
}
