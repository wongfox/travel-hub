import { afterEach, describe, expect, it } from "vitest";
import { createI18n, LOCALE_STORAGE_KEY, persistLocale } from "./index.js";

describe("createI18n", () => {
  it("loads the common namespace resources for the initial locale", () => {
    const i18n = createI18n({ initialLocale: "en" });

    expect(i18n.t("notFound.title")).toBe("Page not found");
  });

  it("switches catalogs when changing language", async () => {
    const i18n = createI18n({ initialLocale: "en" });

    await i18n.changeLanguage("pt");

    expect(i18n.t("notFound.title")).toBe("Página não encontrada");
  });

  it("falls back to the source locale (es) when no locale can be resolved", () => {
    const i18n = createI18n({
      initialLocale: undefined,
      explicitChoice: null,
      bookingLocaleHint: null,
      navigatorLanguages: ["fr-FR"],
    });

    expect(i18n.language).toBe("es");
  });

  it("formats ICU plural messages via the i18next-icu plugin", () => {
    const i18n = createI18n({ initialLocale: "es" });

    expect(i18n.t("sample.itemCount", { count: 1 })).toBe("1 elemento");
    expect(i18n.t("sample.itemCount", { count: 3 })).toBe("3 elementos");
  });
});

/**
 * `persistLocale` (task 7.3, `localization` "Language selection": "MUST
 * persist that selection for the session/link") is the write-half of the
 * explicit-choice resolution `resolveLocale`/`createBrowserI18n` already
 * read from `localStorage` — until this task, nothing ever wrote to it.
 */
describe("persistLocale", () => {
  afterEach(() => {
    window.localStorage.removeItem(LOCALE_STORAGE_KEY);
  });

  it("writes the given locale under the key createBrowserI18n reads on startup", () => {
    persistLocale("pt");

    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("pt");
  });

  it("overwrites a previously persisted locale", () => {
    persistLocale("en");
    persistLocale("es");

    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("es");
  });
});
