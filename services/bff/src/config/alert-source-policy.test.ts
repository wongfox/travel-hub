import { describe, expect, it } from "vitest";
import { DEFAULT_ALERT_SOURCE_POLICY, isAlertSourcePolicyComplete } from "./alert-source-policy.js";

describe("DEFAULT_ALERT_SOURCE_POLICY", () => {
  it("declares an entry for every AlertType (DELAY, RELOCATION, INCIDENT)", () => {
    expect(DEFAULT_ALERT_SOURCE_POLICY.DELAY).toBeDefined();
    expect(DEFAULT_ALERT_SOURCE_POLICY.RELOCATION).toBeDefined();
    expect(DEFAULT_ALERT_SOURCE_POLICY.INCIDENT).toBeDefined();
  });
});

describe("isAlertSourcePolicyComplete", () => {
  it("is true for the default policy (go-live guard prerequisite: AlertSourcePolicy for all alert types)", () => {
    expect(isAlertSourcePolicyComplete(DEFAULT_ALERT_SOURCE_POLICY)).toBe(true);
  });

  it("is false when an alert type is missing from the policy", () => {
    const incomplete = {
      DELAY: DEFAULT_ALERT_SOURCE_POLICY.DELAY,
      INCIDENT: DEFAULT_ALERT_SOURCE_POLICY.INCIDENT,
    };
    expect(isAlertSourcePolicyComplete(incomplete)).toBe(false);
  });

  it("is false for an empty policy", () => {
    expect(isAlertSourcePolicyComplete({})).toBe(false);
  });
});
