import { describe, expect, it } from "vitest";
import { listWifiPackages } from "./list-wifi-packages.js";
import type { WifiPackageRecord, WifiPackageStore } from "./ports.js";

const PACKAGES: WifiPackageRecord[] = [
  {
    id: "WIFI-60",
    code: "wifi-60",
    names: { es: "WiFi 60 minutos", en: "WiFi 60 minutes" },
    priceMinor: 1500,
    currency: "PEN",
    durationMinutes: 60,
  },
  {
    id: "WIFI-PRIME-ONLY",
    code: "wifi-prime-only",
    names: { es: "WiFi Prime" },
    priceMinor: 0,
    currency: "PEN",
    durationMinutes: 240,
    tierRules: ["PRIME", "FIRST_CLASS"],
  },
];

function storeOf(packages: WifiPackageRecord[]): Pick<WifiPackageStore, "listActive"> {
  return { async listActive() { return packages; } };
}

describe("listWifiPackages", () => {
  it("returns every package with no tierRules regardless of tier", async () => {
    const result = await listWifiPackages("VOYAGER", "es", { packageStore: storeOf(PACKAGES) });

    expect(result.map((p) => p.id)).toContain("WIFI-60");
    expect(result.map((p) => p.id)).not.toContain("WIFI-PRIME-ONLY");
  });

  it("includes a tier-restricted package only for its configured tiers", async () => {
    const result = await listWifiPackages("PRIME", "es", { packageStore: storeOf(PACKAGES) });

    expect(result.map((p) => p.id)).toContain("WIFI-PRIME-ONLY");
  });

  it("resolves the package name in the requested locale when available", async () => {
    const result = await listWifiPackages("VOYAGER", "en", { packageStore: storeOf(PACKAGES) });

    const wifi60 = result.find((p) => p.id === "WIFI-60");
    expect(wifi60?.name).toBe("WiFi 60 minutes");
  });

  it("falls back to the default locale (es) when the requested locale has no translation", async () => {
    const result = await listWifiPackages("PRIME", "pt", { packageStore: storeOf(PACKAGES) });

    const primeOnly = result.find((p) => p.id === "WIFI-PRIME-ONLY");
    expect(primeOnly?.name).toBe("WiFi Prime");
  });

  it("maps every WifiPackageDTO field from the record", async () => {
    const result = await listWifiPackages("VOYAGER", "es", { packageStore: storeOf(PACKAGES) });

    const wifi60 = result.find((p) => p.id === "WIFI-60");
    expect(wifi60).toMatchObject({
      id: "WIFI-60",
      code: "wifi-60",
      priceMinor: 1500,
      currency: "PEN",
      durationMinutes: 60,
    });
  });
});
