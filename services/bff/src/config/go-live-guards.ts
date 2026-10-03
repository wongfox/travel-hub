import type { FlagKey } from "./flags.js";
import type { NodeEnvName } from "./env.js";

/**
 * Guarded flags per design Decision 13: each cannot be `true` in production
 * unless its declared prerequisites are met. All other flags are ungated.
 */
export type GuardedFlagKey = Extract<
  FlagKey,
  | "precheckin.production_collection"
  | "push.enabled"
  | "pulse.staff_alerts"
  | "wifi.checkout"
  | "menu.enabled"
  | "destination.enabled"
  | "tier.theming"
  | "offline.content"
>;

/** Adapter selection per port, mirroring `ADAPTER_<PORT>=stub|<vendor>` env config (design Decision 6). */
export interface AdapterSelection {
  precheckinHandoff: string;
  webPush: string;
  staffAlert: string;
  payment: string;
  receipt: string;
  sirPos: string;
  wifiEntitlement: string;
  content: string;
}

export interface GoLiveContext {
  nodeEnv: NodeEnvName;
  adapters: AdapterSelection;
  precheckin: {
    retentionPolicyId?: string;
    retentionDays?: number;
    consentTextVersion?: string;
    kmsKeyConfigured: boolean;
  };
  push: {
    vapidConfigured: boolean;
    alertSourcePolicyComplete: boolean;
    consentTextVersion?: string;
  };
  pulseStaffAlerts: {
    receiverId?: string;
    protocolRef?: string;
    retentionDays?: number;
  };
}

export interface GoLiveGuardResult {
  allowed: boolean;
  missing: string[];
}

/**
 * Environments where guarded flags enforce their prerequisites. `staging` is
 * treated the same as `production` (see env.ts's NodeEnvSchema docstring) so
 * a guarded flag cannot be exercised against stub adapters in staging either.
 */
function isProductionLike(nodeEnv: NodeEnvName): boolean {
  return nodeEnv === "production" || nodeEnv === "staging";
}

function isNonStub(adapter: string): boolean {
  return adapter !== "stub";
}

function checkPrecheckinProductionCollection(ctx: GoLiveContext): GoLiveGuardResult {
  const missing: string[] = [];
  if (!isNonStub(ctx.adapters.precheckinHandoff)) {
    missing.push("non-stub PrecheckinHandoffPort adapter");
  }
  if (!ctx.precheckin.retentionPolicyId) missing.push("PRECHECKIN_RETENTION_POLICY_ID");
  if (!ctx.precheckin.retentionDays) missing.push("PRECHECKIN_RETENTION_DAYS");
  if (!ctx.precheckin.consentTextVersion) missing.push("approved PRECHECKIN_CONSENT_TEXT_VERSION");
  if (!ctx.precheckin.kmsKeyConfigured) missing.push("KMS key");
  return { allowed: missing.length === 0, missing };
}

function checkPushEnabled(ctx: GoLiveContext): GoLiveGuardResult {
  const missing: string[] = [];
  if (!ctx.push.vapidConfigured) missing.push("VAPID keys");
  if (!ctx.push.alertSourcePolicyComplete) missing.push("AlertSourcePolicy for all alert types");
  if (!ctx.push.consentTextVersion) missing.push("PUSH_CONSENT_TEXT_VERSION");
  return { allowed: missing.length === 0, missing };
}

function checkPulseStaffAlerts(ctx: GoLiveContext): GoLiveGuardResult {
  const missing: string[] = [];
  if (!isNonStub(ctx.adapters.staffAlert)) missing.push("non-stub StaffAlertPort adapter");
  if (!ctx.pulseStaffAlerts.receiverId) missing.push("STAFF_ALERT_RECEIVER_ID");
  if (!ctx.pulseStaffAlerts.protocolRef) missing.push("STAFF_ALERT_PROTOCOL_REF");
  if (!ctx.pulseStaffAlerts.retentionDays) missing.push("STAFF_ALERT_RETENTION_DAYS");
  return { allowed: missing.length === 0, missing };
}

function checkWifiCheckout(ctx: GoLiveContext): GoLiveGuardResult {
  const missing: string[] = [];
  if (!isNonStub(ctx.adapters.payment)) missing.push("non-stub PaymentGatewayPort adapter");
  if (!isNonStub(ctx.adapters.receipt)) missing.push("non-stub EReceiptPort adapter");
  if (!isNonStub(ctx.adapters.sirPos)) missing.push("non-stub SirPosPort adapter");
  if (!isNonStub(ctx.adapters.wifiEntitlement)) missing.push("non-stub WifiEntitlementPort adapter");
  return { allowed: missing.length === 0, missing };
}

function checkNonStubContent(ctx: GoLiveContext): GoLiveGuardResult {
  const missing: string[] = [];
  if (!isNonStub(ctx.adapters.content)) missing.push("non-stub ContentPort adapter");
  return { allowed: missing.length === 0, missing };
}

const GUARD_CHECKS: Record<GuardedFlagKey, (ctx: GoLiveContext) => GoLiveGuardResult> = {
  "precheckin.production_collection": checkPrecheckinProductionCollection,
  "push.enabled": checkPushEnabled,
  "pulse.staff_alerts": checkPulseStaffAlerts,
  "wifi.checkout": checkWifiCheckout,
  "menu.enabled": checkNonStubContent,
  "destination.enabled": checkNonStubContent,
  "tier.theming": checkNonStubContent,
  "offline.content": checkNonStubContent,
};

/**
 * Evaluates whether a guarded flag is allowed to be `true` given the
 * current environment and declared prerequisites. Only `development` and
 * `test` always allow guarded flags to run against stubs with synthetic
 * data; `staging` and `production` both enforce the real prerequisites.
 */
export function evaluateGoLiveGuard(flag: GuardedFlagKey, ctx: GoLiveContext): GoLiveGuardResult {
  if (!isProductionLike(ctx.nodeEnv)) {
    return { allowed: true, missing: [] };
  }
  return GUARD_CHECKS[flag](ctx);
}

export class GoLiveGuardError extends Error {
  public readonly flag: GuardedFlagKey;
  public readonly missing: string[];

  constructor(flag: GuardedFlagKey, missing: string[]) {
    super(`Flag "${flag}" cannot be enabled in production: missing ${missing.join(", ")}`);
    this.name = "GoLiveGuardError";
    this.flag = flag;
    this.missing = missing;
  }
}

/**
 * Throws when attempting to enable (`true`) a guarded flag whose
 * prerequisites are unmet in a production-like environment. Disabling a
 * flag is always allowed — a guard only blocks turning risky behavior ON.
 * Called at BFF startup (for compiled-in/env-sourced values) and on every
 * runtime `feature_flag` write.
 */
export function assertGoLiveGuard(
  flag: GuardedFlagKey,
  desiredValue: boolean,
  ctx: GoLiveContext,
): void {
  if (!desiredValue) return;
  const result = evaluateGoLiveGuard(flag, ctx);
  if (!result.allowed) {
    throw new GoLiveGuardError(flag, result.missing);
  }
}
