import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type SupportedLocale = "es" | "en" | "pt";
export const SUPPORTED_LOCALES: readonly SupportedLocale[] = ["es", "en", "pt"];

/**
 * Reads the REAL shipped locale catalog (`apps/web/src/i18n/locales/<locale>/common.json`,
 * task 4.3) straight from disk, so locale-smoke assertions check against
 * the actual translated strings the app ships — not a second,
 * drift-prone copy hardcoded into this test suite.
 */
export function readLocaleCatalog(locale: SupportedLocale): Record<string, unknown> {
  const path = fileURLToPath(
    new URL(`../../apps/web/src/i18n/locales/${locale}/common.json`, import.meta.url),
  );
  return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
}

/** Looks up a dot-path key (e.g. `"trip.loading"`) in a parsed locale catalog. */
export function lookup(catalog: Record<string, unknown>, dotPath: string): string {
  const parts = dotPath.split(".");
  let current: unknown = catalog;
  for (const part of parts) {
    if (typeof current !== "object" || current === null || !(part in current)) {
      throw new Error(`Locale key "${dotPath}" not found in catalog`);
    }
    current = (current as Record<string, unknown>)[part];
  }
  if (typeof current !== "string") {
    throw new Error(`Locale key "${dotPath}" did not resolve to a string`);
  }
  return current;
}
