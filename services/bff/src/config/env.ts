import { z } from "zod";

/**
 * Environments the BFF can run in. `staging` and `production` are treated
 * as "production-like" for go-live guard purposes (see go-live-guards.ts).
 */
export const NodeEnvSchema = z.enum(["development", "test", "staging", "production"]);
export type NodeEnvName = z.infer<typeof NodeEnvSchema>;

const EnvSchema = z.object({
  NODE_ENV: NodeEnvSchema.default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  /**
   * Shared-secret credential for `POST /internal/links` (task 5.2). Optional
   * here so `development`/`test` can fall back to the composition root's
   * dev-only default; production deployments must set a real secret.
   */
  INTERNAL_LINKS_API_KEY: z.string().min(1).optional(),
  /**
   * `PrecheckinHandoffPort` adapter selection (design Decision 6,
   * `ADAPTER_<PORT>=stub|<vendor>`). Task 8.5's go-live guard
   * (`config/go-live-guards.ts`) refuses to enable
   * `precheckin.production_collection` in production/staging while this
   * stays `"stub"`.
   */
  ADAPTER_PRECHECKIN_HANDOFF: z.string().min(1).default("stub"),
  /** Legal-approved retention policy identifier; a `precheckin.production_collection` go-live prerequisite. */
  PRECHECKIN_RETENTION_POLICY_ID: z.string().min(1).optional(),
  /** Retention period for pre check-in data (task 8.5's `purge_after` formula); a go-live prerequisite in production/staging, with a dev/test-only default (`retention.ts`) when unset. */
  PRECHECKIN_RETENTION_DAYS: z.coerce.number().int().positive().optional(),
  /** Approved consent text version; a `precheckin.production_collection` go-live prerequisite. */
  PRECHECKIN_CONSENT_TEXT_VERSION: z.string().min(1).optional(),
  /** Real KMS key identifier; a `precheckin.production_collection` go-live prerequisite (replaces the dev-only default key id). */
  PRECHECKIN_KMS_KEY_ID: z.string().min(1).optional(),
  /** `HANDOFF_GRACE` window (days) in task 8.5's `purge_after` formula; dev/test-only default (`retention.ts`) when unset. */
  PRECHECKIN_HANDOFF_GRACE_DAYS: z.coerce.number().int().positive().optional(),
  /**
   * `ContentPort` adapter selection (design Decision 6,
   * `ADAPTER_<PORT>=stub|<vendor>`). Task 9.1's go-live guard
   * (`config/go-live-guards.ts`) refuses to enable `menu.enabled` or
   * `destination.enabled` in production/staging while this stays `"stub"`.
   */
  ADAPTER_CONTENT: z.string().min(1).default("stub"),
  /**
   * `PaymentGatewayPort` adapter selection (design Decision 6,
   * `ADAPTER_<PORT>=stub|<vendor>`). Task 10.1's go-live guard
   * (`config/go-live-guards.ts`'s `checkWifiCheckout`) refuses to enable
   * `wifi.checkout` in production/staging while this stays `"stub"` (it also
   * requires non-stub receipt/SIR-POS/entitlement adapters that this work
   * unit does not wire — WU19's scope).
   */
  ADAPTER_PAYMENT: z.string().min(1).default("stub"),
  /**
   * `EReceiptPort` adapter selection (design Decision 6,
   * `ADAPTER_<PORT>=stub|<vendor>`). Task 10.3's go-live guard
   * (`config/go-live-guards.ts`'s `checkWifiCheckout`) refuses to enable
   * `wifi.checkout` in production/staging while this stays `"stub"`.
   */
  ADAPTER_RECEIPT: z.string().min(1).default("stub"),
  /**
   * `SirPosPort` adapter selection (design Decision 6,
   * `ADAPTER_<PORT>=stub|<vendor>`). Task 10.3's go-live guard
   * (`config/go-live-guards.ts`'s `checkWifiCheckout`) refuses to enable
   * `wifi.checkout` in production/staging while this stays `"stub"`.
   */
  ADAPTER_SIR_POS: z.string().min(1).default("stub"),
  /**
   * `WifiEntitlementPort` adapter selection (design Decision 6,
   * `ADAPTER_<PORT>=stub|<vendor>`). Task 10.3's go-live guard
   * (`config/go-live-guards.ts`'s `checkWifiCheckout`) refuses to enable
   * `wifi.checkout` in production/staging while this stays `"stub"`.
   */
  ADAPTER_WIFI_ENTITLEMENT: z.string().min(1).default("stub"),
  /**
   * `WebPushPort` adapter selection (design Decision 6,
   * `ADAPTER_<PORT>=stub|<vendor>`). Task 11.1's go-live guard
   * (`config/go-live-guards.ts`'s `checkPushEnabled`) does not itself check
   * this adapter name (it checks VAPID key configuration directly), but it
   * follows the same per-port adapter-selection convention as every other
   * `ADAPTER_*` variable for consistency and future real-adapter wiring.
   */
  ADAPTER_WEB_PUSH: z.string().min(1).default("stub"),
  /** Self-managed VAPID public key (design Decision 11); a `push.enabled` go-live prerequisite alongside the private key. */
  PUSH_VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  /** Self-managed VAPID private key (design Decision 11); a `push.enabled` go-live prerequisite alongside the public key. */
  PUSH_VAPID_PRIVATE_KEY: z.string().min(1).optional(),
  /** Approved consent text version for the `push` purpose; a `push.enabled` go-live prerequisite. */
  PUSH_CONSENT_TEXT_VERSION: z.string().min(1).optional(),
  /** Approved consent text version for the `pulse` purpose; a `pulse.capture` go-live prerequisite (design Decision 13 — independent of `pulse.staff_alerts`). */
  PULSE_CONSENT_TEXT_VERSION: z.string().min(1).optional(),
  /**
   * `StaffAlertPort` adapter selection (design Decision 6,
   * `ADAPTER_<PORT>=stub|<vendor>`). Tasks 11.4-11.5's go-live guard
   * (`config/go-live-guards.ts`'s `checkPulseStaffAlerts`) refuses to enable
   * `pulse.staff_alerts` in production/staging while this stays `"stub"`.
   */
  ADAPTER_STAFF_ALERT: z.string().min(1).default("stub"),
  /** D4a receiving team/channel identifier; a `pulse.staff_alerts` go-live prerequisite. */
  STAFF_ALERT_RECEIVER_ID: z.string().min(1).optional(),
  /** D4a delivery protocol reference (e.g. a webhook or ticketing API identifier); a `pulse.staff_alerts` go-live prerequisite. */
  STAFF_ALERT_PROTOCOL_REF: z.string().min(1).optional(),
  /** Retention period (days) for `pulse_response`/`staff_alert` records; a `pulse.staff_alerts` go-live prerequisite. */
  STAFF_ALERT_RETENTION_DAYS: z.coerce.number().int().positive().optional(),
  /**
   * `AnalyticsSinkPort` adapter selection (design Decision 6,
   * `ADAPTER_<PORT>=stub|<vendor>`). `usage-analytics` is not in
   * `GuardedFlagKey` (task 12.1: unlike push/pulse/wifi/precheckin, nothing
   * in the design's own go-live-guard table names an analytics
   * prerequisite), so this selection is not enforced by a go-live guard —
   * it is read here purely for consistency with every other port's
   * per-adapter-name convention and for future real-adapter wiring.
   */
  ADAPTER_ANALYTICS_SINK: z.string().min(1).default("stub"),
  /**
   * HMAC-SHA256 secret for `trip_hash` pseudonymization (design Data Model:
   * "analytics never sees raw references"). Optional here so
   * `development`/`test` can fall back to the composition root's dev-only
   * default (same convention as `INTERNAL_LINKS_API_KEY`); a real deployment
   * MUST set a real secret, since rotating it invalidates the ability to
   * correlate historical `trip_hash` values for the same reservation.
   */
  ANALYTICS_TRIP_HASH_SECRET: z.string().min(1).optional(),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Parses and validates process environment variables required to boot the
 * BFF. Throws with a descriptive message when required variables are
 * missing or malformed, so misconfiguration fails fast at startup rather
 * than producing confusing runtime errors later.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment configuration: ${result.error.message}`);
  }
  return result.data;
}
