import type { PassengerFeatureKey } from "contracts";

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

/**
 * Narrows the full server-side flag table down to the passenger-visible
 * subset (`packages/contracts`'s `PassengerFeatureKeySchema`), for
 * `TripDTO.features` (task 6.2) and `GET /api/session`'s `features`.
 * Server-only flags (`links.issuance`, `precheckin.production_collection`,
 * `pulse.staff_alerts`) are deliberately excluded — they gate backend
 * behavior, not a passenger-facing UI toggle, per `trip.ts`'s own doc
 * comment on `PassengerFeatureKeySchema`.
 */
export function resolvePassengerFeatures(
  flags: Record<FlagKey, boolean>,
): Record<PassengerFeatureKey, boolean> {
  return {
    precheckinCaptureUi: flags["precheckin.capture_ui"],
    pushEnabled: flags["push.enabled"],
    pushA2hsPrompt: flags["push.a2hs_prompt"],
    pulseCapture: flags["pulse.capture"],
    wifiCheckout: flags["wifi.checkout"],
    menuEnabled: flags["menu.enabled"],
    destinationEnabled: flags["destination.enabled"],
    tierTheming: flags["tier.theming"],
    offlineContent: flags["offline.content"],
  };
}
