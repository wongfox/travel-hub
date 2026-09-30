/**
 * Feature flag keys and their production defaults, per design Decision 13.
 * Runtime overrides (kill switches without redeploy) come from the
 * `feature_flag` table (task 3.3's schema) layered on top of these defaults.
 */
export type FlagKey =
  | "links.issuance"
  | "precheckin.capture_ui"
  | "precheckin.production_collection"
  | "push.enabled"
  | "push.a2hs_prompt"
  | "pulse.capture"
  | "pulse.staff_alerts"
  | "wifi.checkout"
  | "menu.enabled"
  | "destination.enabled"
  | "tier.theming"
  | "offline.content";

export const FLAG_DEFAULTS: Readonly<Record<FlagKey, boolean>> = Object.freeze({
  "links.issuance": true,
  "precheckin.capture_ui": false,
  "precheckin.production_collection": false,
  "push.enabled": false,
  "push.a2hs_prompt": false,
  "pulse.capture": false,
  "pulse.staff_alerts": false,
  "wifi.checkout": false,
  "menu.enabled": false,
  "destination.enabled": false,
  "tier.theming": false,
  "offline.content": false,
});

/**
 * Merges runtime overrides (e.g. from the `feature_flag` table) on top of
 * the compiled-in defaults. Go-live guards (go-live-guards.ts) must be
 * applied separately before persisting/honoring an override that flips a
 * guarded flag on in production.
 */
export function resolveFlags(
  overrides: Partial<Record<FlagKey, boolean>> = {},
): Record<FlagKey, boolean> {
  return { ...FLAG_DEFAULTS, ...overrides };
}
