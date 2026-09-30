import type { ReactNode } from "react";

/**
 * App shell for task 4.1 (Vite + React + PWA scaffold), reused by the
 * router's root route (task 4.2) as the layout wrapping every matched
 * route's `<Outlet />`.
 */
export function AppShell({ children }: { children?: ReactNode }) {
  return (
    <div id="app-shell">
      <h1>Travel Hub</h1>
      {children}
    </div>
  );
}
