import type { WifiPackageRecord, WifiPackageStore } from "../../modules/wifi-checkout/ports.js";

/**
 * Seeded, deterministic `WifiPackageStore` stub (design Decision 6). Package
 * pricing/naming/tier-rules are configuration data per design Decision 8
 * ("currently undefined per the proposal's dependencies" — spec
 * `wifi-package-checkout`'s "WiFi package catalog" requirement); this
 * fixture set is a reasonable placeholder for development/test, not a
 * commercial decision.
 */
const SEED_PACKAGES: readonly WifiPackageRecord[] = Object.freeze([
  {
    id: "WIFI-60",
    code: "wifi-60",
    names: { es: "WiFi 60 minutos", en: "WiFi 60 minutes", pt: "WiFi 60 minutos" },
    priceMinor: 1500,
    currency: "PEN",
    durationMinutes: 60,
  },
  {
    id: "WIFI-FULL-TRIP",
    code: "wifi-full-trip",
    names: { es: "WiFi viaje completo", en: "WiFi full trip" },
    priceMinor: 3000,
    currency: "PEN",
    durationMinutes: 240,
  },
]);

export function createWifiPackageStub(): WifiPackageStore {
  return {
    async listActive() {
      return [...SEED_PACKAGES];
    },

    async findById(id: string) {
      return SEED_PACKAGES.find((pkg) => pkg.id === id) ?? null;
    },
  };
}
