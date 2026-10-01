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
