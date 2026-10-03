import i18next, { type i18n as I18nInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import ICU from "i18next-icu";
import es from "./locales/es/common.json";
import en from "./locales/en/common.json";
import pt from "./locales/pt/common.json";
import { resolveLocale, type LocaleResolutionInput } from "./resolve-locale.js";

export const SOURCE_LOCALE = "es";

const resources = {
  es: { common: es },
  en: { common: en },
  pt: { common: pt },
};

/**
 * A factory (not a module-level singleton) so tests can create isolated
 * instances with a controlled initial locale, and so `main.tsx` can build
 * the real browser-backed instance (reading `localStorage`/`navigator`)
 * without importing browser globals into this module's own tests.
 */
export function createI18n(
  options?: { initialLocale?: string } & LocaleResolutionInput,
): I18nInstance {
  const instance = i18next.createInstance();
  const lng =
    options?.initialLocale ??
    resolveLocale({
      explicitChoice: options?.explicitChoice,
      bookingLocaleHint: options?.bookingLocaleHint,
      navigatorLanguages: options?.navigatorLanguages,
    });

  // `.use()` calls are kept as separate statements (rather than chained)
  // because chaining collapses the instance's generic type and makes
  // `.init()` resolve the wrong overload under this TS/plugin version
  // combination.
  instance.use(ICU);
  instance.use(initReactI18next);

  // `initAsync: false` makes init synchronous when resources are bundled
  // (no backend fetch), which keeps both app startup and tests
  // deterministic without needing to await the returned promise.
  void instance.init({
    lng,
    fallbackLng: SOURCE_LOCALE,
    ns: ["common"],
    defaultNS: "common",
    resources,
    interpolation: { escapeValue: false },
    initAsync: false,
  });

  return instance;
}

const LOCALE_STORAGE_KEY = "th-locale";

/** The browser-backed instance used by `main.tsx`. */
export function createBrowserI18n(): I18nInstance {
  return createI18n({
    explicitChoice:
      typeof window !== "undefined" ? window.localStorage.getItem(LOCALE_STORAGE_KEY) : null,
    navigatorLanguages: typeof navigator !== "undefined" ? navigator.languages : [],
  });
}
