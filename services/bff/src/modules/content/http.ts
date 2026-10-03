import type { FastifyInstance } from "fastify";
import { DEFAULT_SESSION_COOKIE_NAME } from "../trip-access/http.js";
import { resolveActiveSession, type ResolveSessionDeps } from "../trip-access/session-auth.js";
import { FLAG_DEFAULTS, type FlagKey } from "../../config/flags.js";
import type { SirBookingPort } from "../booking/ports.js";
import { resolveTripOverallTier } from "../trip/resolve-trip-tier.js";
import { selectNextMilestone } from "../trip/select-next-milestone.js";
import { isDestinationSection, type ContentPort } from "./ports.js";

export interface ContentRouteDeps extends ResolveSessionDeps {
  sirBooking: Pick<SirBookingPort, "getReservation">;
  content: ContentPort;
  /** Server-side flag table; defaults to the compiled-in defaults (task 3.2) when omitted. */
  flags?: Record<FlagKey, boolean>;
  /** Overridable only for tests; production always shares `trip-access`'s `DEFAULT_SESSION_COOKIE_NAME`. */
  sessionCookieName?: string;
}

/**
 * Registers the `content` module's passenger-facing routes
 * (design-interfaces): `GET /api/content/faq` (`help-center`, task 9.2),
 * `GET /api/content/menu` (`onboard-menu`, task 9.3), `GET
 * /api/content/destination/:section` (`destination-content`, task 9.4), and
 * `GET /api/content/media/:id` (CMS media proxy, shared by 9.2–9.4). Every
 * route requires the same authenticated link session as `trip`/`privacy`
 * (`resolveActiveSession`) — locale comes from the session's own recorded
 * locale, never a client-supplied query param, so a passenger cannot request
 * content outside the locale they bootstrapped with.
 */
export function registerContentRoutes(app: FastifyInstance, deps: ContentRouteDeps): void {
  const cookieName = deps.sessionCookieName ?? DEFAULT_SESSION_COOKIE_NAME;
  const flags = deps.flags ?? FLAG_DEFAULTS;

  async function requireSession(request: { cookies: Record<string, string | undefined> }) {
    const raw = request.cookies[cookieName];
    return resolveActiveSession(raw, deps);
  }

  app.get("/api/content/faq", async (request, reply) => {
    const session = await requireSession(request);
    if (!session) {
      return reply.code(401).send({ code: "link_expired", requestId: request.id });
    }

    const result = await deps.content.getFaq(session.locale);
    reply.header("ETag", result.etag);
    return reply.code(200).send(result);
  });

  app.get("/api/content/menu", async (request, reply) => {
    if (!flags["menu.enabled"]) {
      return reply.code(403).send({ code: "feature_disabled", requestId: request.id });
    }
    const session = await requireSession(request);
    if (!session) {
      return reply.code(401).send({ code: "link_expired", requestId: request.id });
    }

    const reservation = await deps.sirBooking.getReservation({
      reservationRef: session.accessLink.reservationRef,
    });
    const nextMilestone = selectNextMilestone(reservation.legs);
    const tier = resolveTripOverallTier(reservation.legs, nextMilestone?.legId ?? null);

    const result = await deps.content.getMenu(tier, session.locale);
    reply.header("ETag", result.etag);
    return reply.code(200).send(result);
  });

  app.get<{ Params: { section: string } }>("/api/content/destination/:section", async (request, reply) => {
    if (!flags["destination.enabled"]) {
      return reply.code(403).send({ code: "feature_disabled", requestId: request.id });
    }
    const session = await requireSession(request);
    if (!session) {
      return reply.code(401).send({ code: "link_expired", requestId: request.id });
    }

    const { section } = request.params;
    if (!isDestinationSection(section)) {
      return reply.code(404).send({ code: "not_found", requestId: request.id });
    }

    const result = await deps.content.getDestination(section, session.locale);
    reply.header("ETag", result.etag);
    return reply.code(200).send(result);
  });

  app.get<{ Params: { id: string } }>("/api/content/media/:id", async (request, reply) => {
    const session = await requireSession(request);
    if (!session) {
      return reply.code(401).send({ code: "link_expired", requestId: request.id });
    }

    try {
      const media = await deps.content.getMedia(request.params.id);
      reply.type(media.contentType);
      return reply.code(200).send(media.body);
    } catch {
      return reply.code(404).send({ code: "not_found", requestId: request.id });
    }
  });
}
