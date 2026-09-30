import { describe, expect, it } from "vitest";
import { createI18n } from "./index.js";

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
