import type { ReactNode } from "react";
import logoIncarail from "../shared/brand/logo-incarail.svg";
import { ThemeProvider } from "../shared/theme/theme-provider.js";
import { LanguageSwitcher } from "../shared/ui/molecules/language-switcher.js";

/**
 * App shell for task 4.1 (Vite + React + PWA scaffold), reused by the
 * router's root route (task 4.2) as the layout wrapping every matched
 * route's `<Outlet />`. Hosts the `LanguageSwitcher` (task 7.3) here — not
 * duplicated per feature — so the passenger can select or change their
 * language from any screen, per spec `localization` "Language selection".
 *
 * Layout: brand-green header (logo + language control) over a `<main>`
 * landmark, all inside a neutral `ThemeProvider` so screens that have not
 * resolved a tier yet (loading, errors, link landing) still read the brand
 * neutral `--th-color-*` variables; trip screens nest their own tier provider.
 * The logo is a same-origin asset (Vite-hashed, precached by the service
 * worker); its natural 247x51 proportions are kept by sizing the height only.
 */
export function AppShell({ children }: { children?: ReactNode }) {
  return (
    <div id="app-shell">
      <ThemeProvider tier={null}>
        <header className="app-header">
          <div className="app-header__brand">
            <img className="app-header__logo" src={logoIncarail} alt="Inca Rail" width={247} height={51} />
            <h1 className="app-header__title">Travel Hub</h1>
          </div>
          <LanguageSwitcher />
        </header>
        <main className="app-main">{children}</main>
      </ThemeProvider>
    </div>
  );
}
