/**
 * `experience-pulse` retention computation (task 12.3, design Security
 * section: "`staff_alert.payload` and `pulse_response` purge at
 * `answered_at + STAFF_ALERT_RETENTION_DAYS`"). Reuses the same
 * `STAFF_ALERT_RETENTION_DAYS` env var already introduced for the
 * `pulse.staff_alerts` go-live guard (task 11.5) — the design names this one
 * retention period for BOTH tables, not a separate pulse-only variable.
 */

/** Dev/non-production fallback only; production enabling `pulse.staff_alerts` requires a real, Legal-approved `STAFF_ALERT_RETENTION_DAYS` per the go-live guard (config/go-live-guards.ts). This same fallback also applies to `pulse_response` purging even when alerting stays off, since pulse capture alone still needs a retention value. */
export const DEFAULT_PULSE_RETENTION_DAYS = 90;

export interface PulseRetentionConfig {
  retentionDays: number;
}

export interface PulseRetentionEnv {
  STAFF_ALERT_RETENTION_DAYS?: number;
}

export function resolvePulseRetentionConfig(env: PulseRetentionEnv): PulseRetentionConfig {
  return { retentionDays: env.STAFF_ALERT_RETENTION_DAYS ?? DEFAULT_PULSE_RETENTION_DAYS };
}

/** `answeredAt + retentionDays`, computed once at pulse_response creation time (task 12.3). */
export function computePulsePurgeAfter(answeredAtIso: string, retention: PulseRetentionConfig): string {
  const answeredAtMs = new Date(answeredAtIso).getTime();
  return new Date(answeredAtMs + retention.retentionDays * 24 * 60 * 60 * 1000).toISOString();
}
