import { Outlet, createRootRoute, createRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "./app-shell.js";
import { NotFoundBoundary } from "./not-found.js";
import { createApiClient } from "../shared/api/client.js";
import { LinkLandingPage } from "../features/trip-access/link-landing-page.js";
import { TripHomePage } from "../features/home/trip-home-page.js";
import { ItineraryPage } from "../features/itinerary/itinerary-page.js";
import { DocumentsPage } from "../features/documents/documents-page.js";
import { HelpPage } from "../features/help/help-page.js";
import { MenuPage } from "../features/menu/menu-page.js";
import { DestinationPage } from "../features/destination/destination-page.js";
import { WifiPage } from "../features/wifi/wifi-page.js";
import { PushPage } from "../features/push/push-page.js";
import { PulsePage } from "../features/pulse/pulse-page.js";

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
 * `trip-home` destination for the link-landing redirect (task 6.5, replacing
 * the earlier `TripHomeStub` placeholder). `itinerary`/`documents` (also task
 * 6.5) are separate sibling routes rather than sections of this one, since
 * the capability map treats `home`, `itinerary`, and `documents` as distinct
 * web features that each own their route.
 */
function TripHomeRoute() {
  return <TripHomePage apiClient={defaultApiClient} />;
}

function TripItineraryRoute() {
  return <ItineraryPage apiClient={defaultApiClient} />;
}

function TripDocumentsRoute() {
  return <DocumentsPage apiClient={defaultApiClient} />;
}

/**
 * `help-center`, `onboard-menu`, and `destination-content` (tasks 9.2-9.4):
 * separate sibling routes, same convention as `itinerary`/`documents`.
 */
function HelpRoute() {
  return <HelpPage apiClient={defaultApiClient} />;
}

function MenuRoute() {
  return <MenuPage apiClient={defaultApiClient} />;
}

function DestinationRoute() {
  return <DestinationPage apiClient={defaultApiClient} />;
}

/**
 * `wifi-package-checkout` (task 10.4): one route handles both the catalog
 * and the return-URL landing view (`?order=<idempotencyKey>`, see
 * `WifiPage`'s own doc comment) — `buildReturnUrl` (`wifi-checkout/http.ts`)
 * already points back at this exact path.
 */
function WifiRoute() {
  return <WifiPage apiClient={defaultApiClient} />;
}

/** `push-notifications` (task 11.3): same sibling-route convention as `help`/`menu`/`destination`/`wifi`. */
function PushRoute() {
  return <PushPage apiClient={defaultApiClient} />;
}

/** `experience-pulse` (task 11.6): same sibling-route convention as `help`/`menu`/`destination`/`wifi`/`push`. */
function PulseRoute() {
  return <PulsePage apiClient={defaultApiClient} />;
}

const tripAccessLandingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/t",
  component: TripAccessLandingRoute,
});

const tripHomeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/trip",
  component: TripHomeRoute,
});

const tripItineraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/trip/itinerary",
  component: TripItineraryRoute,
});

const tripDocumentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/trip/documents",
  component: TripDocumentsRoute,
});

const tripHelpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/trip/help",
  component: HelpRoute,
});

const tripMenuRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/trip/menu",
  component: MenuRoute,
});

const tripDestinationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/trip/destination",
  component: DestinationRoute,
});

const tripWifiRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/trip/wifi",
  component: WifiRoute,
});

const tripPushRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/trip/push",
  component: PushRoute,
});

const tripPulseRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/trip/pulse",
  component: PulseRoute,
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  tripAccessLandingRoute,
  tripHomeRoute,
  tripItineraryRoute,
  tripDocumentsRoute,
  tripHelpRoute,
  tripMenuRoute,
  tripDestinationRoute,
  tripWifiRoute,
  tripPushRoute,
  tripPulseRoute,
]);
