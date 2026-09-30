import { Outlet, createRootRoute, createRoute } from "@tanstack/react-router";
import { AppShell } from "./app-shell.js";
import { NotFoundBoundary } from "./not-found.js";

/**
 * Code-based route tree stub (task 4.2). File-based routing/codegen is not
 * introduced yet — capability features register their routes as children
 * of `rootRoute` as they land in later work units (Phase 5+).
 */
export const rootRoute = createRootRoute({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
  notFoundComponent: NotFoundBoundary,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => null,
});

export const routeTree = rootRoute.addChildren([indexRoute]);
