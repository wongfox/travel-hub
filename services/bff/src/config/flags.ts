import type { PassengerFeatureKey } from "contracts";

/**
 * Feature flag keys and their production defaults, per design Decision 13.
 * Operator overrides come from the `FEATURE_FLAG_OVERRIDES` env var (see
 * `parseFlagOverrides`) layered on top of these defaults: defaults < overrides.
 * The `feature_flag` table (task 3.3's schema) has no reader and is not used.
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
 * Parses the `FEATURE_FLAG_OVERRIDES` env var: a JSON object mapping known
 * flag keys to booleans (e.g. `{"wifi.checkout":true}`). Unset/blank means no
 * overrides. Unknown keys, non-boolean values and malformed JSON throw, so a
 * typo fails the api/worker boot instead of silently leaving a flag off. The
 * result still flows through the go-live guards (go-live-guards.ts); it never
 * bypasses them. Must hold no secrets.
 */
export function parseFlagOverrides(raw: string | undefined): Partial<Record<FlagKey, boolean>> {
  if (raw === undefined || raw.trim() === "") return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`FEATURE_FLAG_OVERRIDES is not valid JSON: ${(error as Error).message}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error('FEATURE_FLAG_OVERRIDES must be a JSON object such as {"wifi.checkout":true}');
  }
  const entries = Object.entries(parsed as Record<string, unknown>);
  const unknownKeys = entries.map(([key]) => key).filter((key) => !Object.hasOwn(FLAG_DEFAULTS, key));
  if (unknownKeys.length > 0) {
    throw new Error(
      `FEATURE_FLAG_OVERRIDES has unknown flag(s): ${unknownKeys.join(", ")}. ` +
        `Known flags: ${Object.keys(FLAG_DEFAULTS).join(", ")}`,
    );
  }
  const result: Partial<Record<FlagKey, boolean>> = {};
  for (const [key, value] of entries) {
    if (typeof value !== "boolean") {
      throw new Error(`FEATURE_FLAG_OVERRIDES["${key}"] must be a boolean, got ${JSON.stringify(value)}`);
    }
    result[key as FlagKey] = value;
  }
  return result;
}

/**
 * Merges operator overrides (see `parseFlagOverrides`) on top of
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
