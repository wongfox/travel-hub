/**
 * Pre check-in retention/purge computation (task 8.5, design's
 * Security/Retention section): `purge_after` = `min(handed_off_at +
 * HANDOFF_GRACE, trip end + PRECHECKIN_RETENTION_DAYS)`. The two halves of
 * that formula are computed at different times — `trip end + retention` is
 * known at submission time (task 8.3); `handed_off_at + grace` is only known
 * once the `HandoffJob` actually completes a handoff — so this module splits
 * the formula into `computeInitialPurgeAfter` (submission time) and
 * `tightenPurgeAfter` (handoff time), which together always converge on the
 * same `min(...)` result regardless of ordering.
 */

/** Dev/non-production fallback only; production enabling `precheckin.production_collection` requires a real, Legal-approved `PRECHECKIN_RETENTION_DAYS` per the go-live guard (config/go-live-guards.ts). */
export const DEFAULT_PRECHECKIN_RETENTION_DAYS = 90;
/** Dev/non-production fallback only; same go-live-guard caveat as above. */
export const DEFAULT_HANDOFF_GRACE_DAYS = 7;

export interface RetentionConfig {
  retentionDays: number;
  handoffGraceMs: number;
}

export interface RetentionEnv {
  PRECHECKIN_RETENTION_DAYS?: number;
  PRECHECKIN_HANDOFF_GRACE_DAYS?: number;
}

export function resolveRetentionConfig(env: RetentionEnv): RetentionConfig {
  return {
    retentionDays: env.PRECHECKIN_RETENTION_DAYS ?? DEFAULT_PRECHECKIN_RETENTION_DAYS,
    handoffGraceMs: (env.PRECHECKIN_HANDOFF_GRACE_DAYS ?? DEFAULT_HANDOFF_GRACE_DAYS) * 24 * 60 * 60 * 1000,
  };
}

/** `trip end + PRECHECKIN_RETENTION_DAYS`, computed once at submission time (task 8.3's `submitPrecheckin`). */
export function computeInitialPurgeAfter(tripEndLocalIso: string, retention: RetentionConfig): string {
  const tripEndMs = new Date(tripEndLocalIso).getTime();
  return new Date(tripEndMs + retention.retentionDays * 24 * 60 * 60 * 1000).toISOString();
}

/** Keeps the earlier of the current `purge_after` and a new candidate — `purge_after` only ever tightens, never loosens. */
export function tightenPurgeAfter(currentPurgeAfterIso: string, candidateIso: string): string {
  return new Date(candidateIso).getTime() < new Date(currentPurgeAfterIso).getTime()
    ? candidateIso
    : currentPurgeAfterIso;
}
