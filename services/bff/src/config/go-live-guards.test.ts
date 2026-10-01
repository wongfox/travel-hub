import { describe, expect, it } from "vitest";
import {
  assertGoLiveGuard,
  evaluateGoLiveGuard,
  GoLiveGuardError,
  type GoLiveContext,
} from "./go-live-guards.js";

function baseContext(overrides: Partial<GoLiveContext> = {}): GoLiveContext {
  return {
    nodeEnv: "production",
    adapters: {
      precheckinHandoff: "stub",
      webPush: "stub",
      staffAlert: "stub",
      payment: "stub",
      receipt: "stub",
      sirPos: "stub",
      wifiEntitlement: "stub",
      content: "stub",
    },
    precheckin: { kmsKeyConfigured: false },
    push: { vapidConfigured: false, alertSourcePolicyComplete: false },
    pulseCapture: {},
    pulseStaffAlerts: {},
    ...overrides,
  };
}

describe("evaluateGoLiveGuard — precheckin.production_collection", () => {
  it("refuses in production when prerequisites are missing", () => {
    const result = evaluateGoLiveGuard("precheckin.production_collection", baseContext());

    expect(result.allowed).toBe(false);
    expect(result.missing).toContain("non-stub PrecheckinHandoffPort adapter");
    expect(result.missing).toContain("PRECHECKIN_RETENTION_POLICY_ID");
  });

  it("allows in production once every prerequisite is declared", () => {
    const ctx = baseContext({
      adapters: { ...baseContext().adapters, precheckinHandoff: "s3" },
      precheckin: {
        retentionPolicyId: "policy-1",
        retentionDays: 30,
        consentTextVersion: "v1",
        kmsKeyConfigured: true,
      },
    });

    const result = evaluateGoLiveGuard("precheckin.production_collection", ctx);

    expect(result).toEqual({ allowed: true, missing: [] });
  });
});

describe("evaluateGoLiveGuard — push.enabled", () => {
  it("refuses in production without VAPID keys, alert source policy, and consent text version", () => {
    const result = evaluateGoLiveGuard("push.enabled", baseContext());

    expect(result.allowed).toBe(false);
    expect(result.missing).toEqual(
      expect.arrayContaining([
        "VAPID keys",
        "AlertSourcePolicy for all alert types",
        "PUSH_CONSENT_TEXT_VERSION",
      ]),
    );
  });

  it("allows in production once VAPID, policy, and consent version are configured", () => {
    const ctx = baseContext({
      push: { vapidConfigured: true, alertSourcePolicyComplete: true, consentTextVersion: "v2" },
    });

    expect(evaluateGoLiveGuard("push.enabled", ctx)).toEqual({ allowed: true, missing: [] });
  });
});

describe("evaluateGoLiveGuard — pulse.capture", () => {
  it("refuses in production without an approved consent text version", () => {
    const result = evaluateGoLiveGuard("pulse.capture", baseContext());

    expect(result.allowed).toBe(false);
    expect(result.missing).toEqual(["PULSE_CONSENT_TEXT_VERSION"]);
  });

  it("allows in production once the consent text version is declared", () => {
    const ctx = baseContext({ pulseCapture: { consentTextVersion: "v1" } });

    expect(evaluateGoLiveGuard("pulse.capture", ctx)).toEqual({ allowed: true, missing: [] });
  });

  it("allows in non-production regardless of consent text version", () => {
    const ctx = baseContext({ nodeEnv: "development" });

    expect(evaluateGoLiveGuard("pulse.capture", ctx)).toEqual({ allowed: true, missing: [] });
  });
});

describe("evaluateGoLiveGuard — pulse.staff_alerts", () => {
  it("refuses in production without a non-stub StaffAlertPort and receiver/protocol/retention config", () => {
    const result = evaluateGoLiveGuard("pulse.staff_alerts", baseContext());

    expect(result.allowed).toBe(false);
    expect(result.missing).toEqual(
      expect.arrayContaining([
        "non-stub StaffAlertPort adapter",
        "STAFF_ALERT_RECEIVER_ID",
        "STAFF_ALERT_PROTOCOL_REF",
        "STAFF_ALERT_RETENTION_DAYS",
      ]),
    );
  });

  it("allows in production once the adapter and receiver config are declared", () => {
    const ctx = baseContext({
      adapters: { ...baseContext().adapters, staffAlert: "internal-queue" },
      pulseStaffAlerts: { receiverId: "ops-team", protocolRef: "proto-1", retentionDays: 90 },
    });

    expect(evaluateGoLiveGuard("pulse.staff_alerts", ctx)).toEqual({ allowed: true, missing: [] });
  });
});

describe("evaluateGoLiveGuard — wifi.checkout", () => {
  it("refuses in production while payment/receipt/SIR-POS/entitlement adapters are stubs", () => {
    const result = evaluateGoLiveGuard("wifi.checkout", baseContext());

    expect(result.allowed).toBe(false);
    expect(result.missing).toEqual(
      expect.arrayContaining([
        "non-stub PaymentGatewayPort adapter",
        "non-stub EReceiptPort adapter",
        "non-stub SirPosPort adapter",
        "non-stub WifiEntitlementPort adapter",
      ]),
    );
  });

  it("allows in production once every commerce adapter is non-stub", () => {
    const ctx = baseContext({
      adapters: {
        ...baseContext().adapters,
        payment: "acme-gateway",
        receipt: "acme-receipts",
        sirPos: "sir",
        wifiEntitlement: "ti-convergia",
      },
    });

    expect(evaluateGoLiveGuard("wifi.checkout", ctx)).toEqual({ allowed: true, missing: [] });
  });
});

describe.each([
  ["menu.enabled", "contentGoLive-menu"],
  ["destination.enabled", "contentGoLive-destination"],
  ["tier.theming", "contentGoLive-theming"],
  ["offline.content", "contentGoLive-offline"],
] as const)("evaluateGoLiveGuard — content flag %s", (flagKey, nonStubAdapterName) => {
  it("refuses in production while the CMS adapter is a stub", () => {
    const result = evaluateGoLiveGuard(flagKey, baseContext());

    expect(result.allowed).toBe(false);
    expect(result.missing).toContain("non-stub ContentPort adapter");
  });

  it("allows in production once the CMS adapter is non-stub", () => {
    const ctx = baseContext({ adapters: { ...baseContext().adapters, content: nonStubAdapterName } });

    expect(evaluateGoLiveGuard(flagKey, ctx)).toEqual({ allowed: true, missing: [] });
  });
});

describe("evaluateGoLiveGuard — non-production environments", () => {
  it("allows every guarded flag against stubs when nodeEnv is not production", () => {
    const ctx = baseContext({ nodeEnv: "development" });

    expect(evaluateGoLiveGuard("wifi.checkout", ctx)).toEqual({ allowed: true, missing: [] });
    expect(evaluateGoLiveGuard("push.enabled", ctx)).toEqual({ allowed: true, missing: [] });
    expect(evaluateGoLiveGuard("pulse.staff_alerts", ctx)).toEqual({ allowed: true, missing: [] });
    expect(evaluateGoLiveGuard("precheckin.production_collection", ctx)).toEqual({
      allowed: true,
      missing: [],
    });
  });

});

describe("evaluateGoLiveGuard — staging is production-like", () => {
  it("enforces guarded-flag prerequisites in staging exactly like production", () => {
    const ctx = baseContext({ nodeEnv: "staging" });

    expect(evaluateGoLiveGuard("wifi.checkout", ctx)).toEqual({
      allowed: false,
      missing: [
        "non-stub PaymentGatewayPort adapter",
        "non-stub EReceiptPort adapter",
        "non-stub SirPosPort adapter",
        "non-stub WifiEntitlementPort adapter",
      ],
    });
  });

  it("allows in staging once prerequisites are met, same as production", () => {
    const ctx = baseContext({
      nodeEnv: "staging",
      adapters: {
        precheckinHandoff: "vendor",
        webPush: "vendor",
        staffAlert: "vendor",
        payment: "vendor",
        receipt: "vendor",
        sirPos: "vendor",
        wifiEntitlement: "ti-convergia",
        content: "vendor",
      },
    });

    expect(evaluateGoLiveGuard("wifi.checkout", ctx)).toEqual({ allowed: true, missing: [] });
  });
});

describe("assertGoLiveGuard", () => {
  it("throws a GoLiveGuardError naming the missing prerequisites when enabling a guarded flag in production", () => {
    expect(() => assertGoLiveGuard("wifi.checkout", true, baseContext())).toThrow(GoLiveGuardError);
  });

  it("never throws when disabling a flag, even in production with no prerequisites met", () => {
    expect(() => assertGoLiveGuard("wifi.checkout", false, baseContext())).not.toThrow();
  });

  it("does not throw when enabling a guarded flag whose prerequisites are all satisfied", () => {
    const ctx = baseContext({ nodeEnv: "development" });

    expect(() => assertGoLiveGuard("wifi.checkout", true, ctx)).not.toThrow();
  });
});
