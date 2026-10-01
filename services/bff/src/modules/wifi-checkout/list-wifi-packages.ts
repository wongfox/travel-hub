import { resolveLocalizedContent, type Locale, type ServiceTier, type WifiPackageDTO } from "contracts";
import type { WifiPackageRecord, WifiPackageStore } from "./ports.js";

export interface ListWifiPackagesDeps {
  packageStore: Pick<WifiPackageStore, "listActive">;
  /** CMS source/default locale to fall back to; defaults to `es` (design Decision 14). */
  defaultLocale?: Locale;
}

function appliesToTier(pkg: WifiPackageRecord, tier: ServiceTier): boolean {
  return !pkg.tierRules || pkg.tierRules.includes(tier);
}

function toDTO(pkg: WifiPackageRecord, locale: Locale, defaultLocale: Locale): WifiPackageDTO {
  const resolved = resolveLocalizedContent({ byLocale: pkg.names, requestedLocale: locale, defaultLocale });
  return {
    id: pkg.id,
    code: pkg.code,
    name: resolved.data,
    priceMinor: pkg.priceMinor,
    currency: pkg.currency,
    durationMinutes: pkg.durationMinutes,
  };
}

/**
 * `GET /api/wifi/packages` use case (task 10.1): tier-filtered catalog,
 * localized to the passenger's session locale with `es` fallback — the same
 * `resolveLocalizedContent` primitive `content`'s `ContentPort` stub uses
 * (task 9.1).
 */
export async function listWifiPackages(
  tier: ServiceTier,
  locale: Locale,
  deps: ListWifiPackagesDeps,
): Promise<WifiPackageDTO[]> {
  const defaultLocale = deps.defaultLocale ?? "es";
  const all = await deps.packageStore.listActive();
  return all.filter((pkg) => appliesToTier(pkg, tier)).map((pkg) => toDTO(pkg, locale, defaultLocale));
}
