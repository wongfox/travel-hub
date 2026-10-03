import type { ServiceTier } from "./service-tier.js";

/**
 * CMS tier-fallback mechanism (task 9.1, design Decision 10: "Fallbacks:
 * tier -> default tier"). Mirrors `resolve-content-locale.ts`'s
 * `resolveLocalizedContent` exactly — the same shape of problem (content
 * keyed by a finite dimension, with a configured default to fall back to)
 * applied to tier instead of locale. `ContentPort`'s stub adapter (task 9.1)
 * composes this with `resolveLocalizedContent` for `getMenu`: tier resolved
 * first, then locale resolved within that tier's content.
 */
export interface ResolveTieredContentInput<T> {
  /** Content keyed by whichever tiers actually have CMS configuration; not every tier needs an entry. */
  byTier: Partial<Record<ServiceTier, T>>;
  /** The passenger's resolved service tier (`resolveServiceTier`'s output, including the neutral `"UNKNOWN"` fallback). */
  requestedTier: ServiceTier;
  /** The CMS default/base tier to fall back to when the requested tier has no configured content. */
  defaultTier: ServiceTier;
}

export interface ResolvedTieredContent<T> {
  data: T;
  tier: ServiceTier;
  fallbackTier: boolean;
}

/**
 * Thrown when neither the requested tier nor the configured default tier has
 * any content — mirrors `MissingDefaultLocaleContentError`: the system must
 * never show empty content, but it also cannot fabricate content that does
 * not exist anywhere; callers must surface this as an explicit
 * content-configuration gap, not a silent blank screen.
 */
export class MissingDefaultTierContentError extends Error {
  constructor(defaultTier: ServiceTier) {
    super(`No content found for the default tier "${defaultTier}"; cannot resolve or fall back.`);
    this.name = "MissingDefaultTierContentError";
  }
}

export function resolveTieredContent<T>({
  byTier,
  requestedTier,
  defaultTier,
}: ResolveTieredContentInput<T>): ResolvedTieredContent<T> {
  const requested = byTier[requestedTier];
  if (requested !== undefined) {
    return { data: requested, tier: requestedTier, fallbackTier: false };
  }

  const fallback = byTier[defaultTier];
  if (fallback === undefined) {
    throw new MissingDefaultTierContentError(defaultTier);
  }

  return { data: fallback, tier: defaultTier, fallbackTier: true };
}
