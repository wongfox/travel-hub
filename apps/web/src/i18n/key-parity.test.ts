import { describe, expect, it } from "vitest";
import es from "./locales/es/common.json";
import en from "./locales/en/common.json";
import pt from "./locales/pt/common.json";

/**
 * Task 4.3's acceptance criterion: this test MUST fail if any locale file
 * is missing a key present in another. `flattenKeys` walks nested objects
 * so a gap at any depth is caught, not just at the top level.
 */
function flattenKeys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [prefix];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

const locales: Record<string, unknown> = { es, en, pt };

describe("locale key parity (common namespace)", () => {
  it("has an identical key set across es, en, and pt", () => {
    const keysByLocale = Object.fromEntries(
      Object.entries(locales).map(([locale, catalog]) => [locale, flattenKeys(catalog).sort()]),
    );

    expect(keysByLocale.en).toEqual(keysByLocale.es);
    expect(keysByLocale.pt).toEqual(keysByLocale.es);
  });
});
