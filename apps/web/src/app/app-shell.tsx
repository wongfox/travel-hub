import type { ReactNode } from "react";
import { LanguageSwitcher } from "../shared/ui/molecules/language-switcher.js";

/**
 * App shell for task 4.1 (Vite + React + PWA scaffold), reused by the
 * router's root route (task 4.2) as the layout wrapping every matched
 * route's `<Outlet />`. Hosts the `LanguageSwitcher` (task 7.3) here — not
 * duplicated per feature — so the passenger can select or change their
 * language from any screen, per spec `localization` "Language selection".
 */
export function AppShell({ children }: { children?: ReactNode }) {
  return (
    <div id="app-shell">
      <h1>Travel Hub</h1>
      <LanguageSwitcher />
      {children}
    </div>
  );
}
