import type { FastifyInstance } from "fastify";
import { DEFAULT_SESSION_COOKIE_NAME } from "../trip-access/http.js";
import { resolveActiveSession, type ResolveSessionDeps } from "../trip-access/session-auth.js";
import { getTripOverview, type GetTripOverviewDeps } from "./get-trip-overview.js";

export interface TripRouteDeps extends ResolveSessionDeps, GetTripOverviewDeps {
  /** Overridable only for tests; production always shares `trip-access`'s `DEFAULT_SESSION_COOKIE_NAME`. */
  sessionCookieName?: string;
}

/**
 * Registers `GET /api/trip` (task 6.2, design-interfaces): the session-
 * authenticated trip overview projection. Session resolution is shared with
 * `trip-access` (`resolveActiveSession`) so a session created via
 * `POST /api/session` is immediately usable here — the two modules' stores
 * must be the same instances (wired in `composition-root.ts`).
 */
export function registerTripRoutes(app: FastifyInstance, deps: TripRouteDeps): void {
  const cookieName = deps.sessionCookieName ?? DEFAULT_SESSION_COOKIE_NAME;

  app.get("/api/trip", async (request, reply) => {
    const raw = request.cookies[cookieName];
    const session = await resolveActiveSession(raw, deps);
    if (!session) {
      return reply.code(401).send({ code: "link_expired", requestId: request.id });
    }

    const trip = await getTripOverview(session.accessLink, deps);
    return reply.code(200).send(trip);
  });
}
