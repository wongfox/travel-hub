/**
 * `complementary-services-redirect` (task 10.5): `GET /api/out/tfe?placement=`
 * resolves a caller-supplied `placement` key against an explicit allowlist
 * BEFORE ever building a redirect target — the open-redirect-safety
 * acceptance criterion. `placement` is never interpolated into a URL and
 * never used as (or to build) the destination itself; it only ever indexes
 * into `allowedPlacements`, so an arbitrary/unknown value (including one
 * that looks like a URL) resolves to `null` instead of a redirect.
 */
export interface TfeRedirectConfig {
  /** The TFE site's origin; every resolved redirect target is a path under this origin, never a caller-controlled host. */
  baseUrl: string;
  /** Allowlist: `placement` key -> destination path on `baseUrl`. The only source of truth for valid placements. */
  allowedPlacements: Record<string, string>;
  /** Configurable attribution query parameters (design's "configurable attribution parameters") appended to every resolved redirect, alongside the resolved `placement` itself. */
  attributionParams: Record<string, string>;
}

/**
 * Resolves `placement` to a full TFE redirect URL, or `null` if `placement`
 * is not on the allowlist. Never throws on a malformed/arbitrary input.
 */
export function resolveTfeRedirectUrl(placement: string, config: TfeRedirectConfig): string | null {
  const path = config.allowedPlacements[placement];
  if (path === undefined) {
    return null;
  }

  const url = new URL(path, config.baseUrl);
  for (const [key, value] of Object.entries(config.attributionParams)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("placement", placement);
  return url.toString();
}
