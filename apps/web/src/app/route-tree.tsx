import { Outlet, createRootRoute, createRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "./app-shell.js";
import { NotFoundBoundary } from "./not-found.js";
import { createApiClient } from "../shared/api/client.js";
import { LinkLandingPage } from "../features/trip-access/link-landing-page.js";

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

// Same-origin fetch wrapper (design: web and API share one origin) — stateless,
// so one shared instance is fine, matching `providers.tsx`'s module-level
// `defaultQueryClient` convention.
const defaultApiClient = createApiClient();

/**
 * Thin router-bound wrapper (task 5.5): resolves TanStack Router's real
 * `useNavigate` here, at the one place a route component actually needs
 * it, so `LinkLandingPage` itself stays router-free and unit-testable with
 * a plain injected `navigate` function.
 */
function TripAccessLandingRoute() {
  const navigate = useNavigate();
  return (
    <LinkLandingPage
      apiClient={defaultApiClient}
      navigate={(path) => void navigate({ to: path, replace: true })}
    />
  );
}

/**
 * Placeholder trip-home destination for the link-landing redirect. The real
 * trip-home UI (status, next milestone, alert banner) lands in a later work
 * unit (task 6.5) — this route exists now purely so 5.5's redirect has a
 * real, testable navigation target.
 */
function TripHomeStub() {
  return <p data-testid="trip-home-stub">Trip home</p>;
}

const tripAccessLandingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/t",
  component: TripAccessLandingRoute,
});

const tripHomeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/trip",
  component: TripHomeStub,
});

export const routeTree = rootRoute.addChildren([indexRoute, tripAccessLandingRoute, tripHomeRoute]);
