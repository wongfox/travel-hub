import { useTranslation } from "react-i18next";
import type { Locale } from "contracts";
import { persistLocale } from "../../../i18n/index.js";

const SUPPORTED_LOCALES: Locale[] = ["es", "en", "pt"];

/**
 * `localization` "Language selection" (atomic-design molecule, rendered in
 * `AppShell` so it is present on every screen per "Selected language
 * persists across screens"): lets the passenger switch the active UI
 * language and persists the choice (`persistLocale`) so it survives a
 * reload, per spec's "MUST persist that selection for the session/link".
 * Rendered as a compact segmented control: the visible label is the locale
 * code, while the accessible name stays the full localized language name.
 */
export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();

  function selectLocale(locale: Locale): void {
    void i18n.changeLanguage(locale);
    persistLocale(locale);
  }

  return (
    <div role="group" aria-label={t("language.selectorLabel")} className="segmented">
      {SUPPORTED_LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          className="segmented__option"
          aria-pressed={i18n.language === locale}
          onClick={() => selectLocale(locale)}
        >
          <span aria-hidden="true">{locale.toUpperCase()}</span>
          <span className="visually-hidden">{t(`language.${locale}`)}</span>
        </button>
      ))}
    </div>
  );
}
