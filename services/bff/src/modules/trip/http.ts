import type { FastifyInstance } from "fastify";
import { DEFAULT_SESSION_COOKIE_NAME } from "../trip-access/http.js";
import { resolveActiveSession, type ResolveSessionDeps } from "../trip-access/session-auth.js";
import { getTripOverview, type GetTripOverviewDeps } from "./get-trip-overview.js";
import { getDocumentFile, type GetDocumentFileDeps } from "./get-document-file.js";
import { DocumentNotFoundError } from "./ports.js";

export interface TripRouteDeps extends ResolveSessionDeps, GetTripOverviewDeps, GetDocumentFileDeps {
  /** Overridable only for tests; production always shares `trip-access`'s `DEFAULT_SESSION_COOKIE_NAME`. */
  sessionCookieName?: string;
}

/**
 * Registers `GET /api/trip` (task 6.2, design-interfaces) and `GET
 * /api/documents/:id` (`travel-documents`, task 6.4). Session resolution is
 * shared with `trip-access` (`resolveActiveSession`) so a session created via
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

  app.get<{ Params: { id: string } }>("/api/documents/:id", async (request, reply) => {
    const raw = request.cookies[cookieName];
    const session = await resolveActiveSession(raw, deps);
    if (!session) {
      return reply.code(401).send({ code: "link_expired", requestId: request.id });
    }

    try {
      // Deliberately no `Cache-Control: no-store` here: unlike the
      // `/api/precheckin/**`, `/api/session`, `/api/wifi/**`, `/api/push/**`
      // denylist (task 4.6/7.2), ticket documents are exactly what
      // `offline-trip-data` (task 7.1) caches into `th-docs-v1` for offline
      // access — this route must stay cacheable by the service worker.
      const file = await getDocumentFile(session.accessLink, request.params.id, deps);
      reply.type(file.contentType);
      return reply.code(200).send(file.body);
    } catch (error) {
      if (error instanceof DocumentNotFoundError) {
        return reply.code(404).send({ code: "not_found", requestId: request.id });
      }
      throw error;
    }
  });
}
