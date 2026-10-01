import { SendAnalyticsEventsRequestSchema } from "contracts";
import type { FastifyInstance } from "fastify";
import { DEFAULT_SESSION_COOKIE_NAME } from "../trip-access/http.js";
import { resolveActiveSession, type ResolveSessionDeps } from "../trip-access/session-auth.js";
import { ConsentRequiredError } from "../privacy/consent-guard.js";
import type { ConsentStore } from "../privacy/consent-store.js";
import { recordAnalyticsEvents } from "./record-analytics-events.js";
import type { AnalyticsEventStore } from "./ports.js";

export interface AnalyticsRouteDeps extends ResolveSessionDeps {
  consentStore: Pick<ConsentStore, "findLatest">;
  analyticsEventStore: Pick<AnalyticsEventStore, "create">;
  secret: string;
  /** Overridable only for tests; production always shares `trip-access`'s `DEFAULT_SESSION_COOKIE_NAME`. */
  sessionCookieName?: string;
}

/**
 * Registers `POST /api/events` (task 12.1, `usage-analytics`): consent-gated
 * (reuses task 8.1's shared guard), `sendBeacon`-compatible. A beacon sent
 * via `new Blob([...], { type: "text/plain" })` (the conservative,
 * CORS-safelisted content type `navigator.sendBeacon` call sites commonly
 * use) arrives with `Content-Type: text/plain`, which Fastify's default JSON
 * parser does not touch — this route registers an additional parser, scoped
 * to its own encapsulated context (same `app.register(async (instance) =>
 * ...)` isolation convention as `wifi-checkout/http.ts`'s raw-body webhook
 * parser), that JSON-parses a `text/plain` body too. `application/json`
 * (e.g. a non-beacon `fetch` fallback) keeps working via Fastify's own
 * default parser, unaffected by this addition.
 *
 * A beacon request cannot read the response, so this handler's status code
 * is best-effort diagnostic information for non-beacon callers only — the
 * consent gate and persistence logic below are authoritative regardless of
 * whether anything ever reads the response.
 */
export function registerAnalyticsRoutes(app: FastifyInstance, deps: AnalyticsRouteDeps): void {
  const cookieName = deps.sessionCookieName ?? DEFAULT_SESSION_COOKIE_NAME;

  void app.register(async (instance) => {
    instance.addContentTypeParser("text/plain", { parseAs: "string" }, (_request, body, done) => {
      try {
        done(null, JSON.parse(body.toString()));
      } catch (error) {
        done(error as Error, undefined);
      }
    });

    instance.post("/api/events", async (request, reply) => {
      const raw = request.cookies[cookieName];
      const session = await resolveActiveSession(raw, deps);
      if (!session) {
        return reply.code(401).send({ code: "link_expired", requestId: request.id });
      }

      const parsed = SendAnalyticsEventsRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ code: "invalid_request", requestId: request.id });
      }

      try {
        await recordAnalyticsEvents(
          { reservationRef: session.accessLink.reservationRef, events: parsed.data.events },
          { analyticsEventStore: deps.analyticsEventStore, consentStore: deps.consentStore, secret: deps.secret },
        );
      } catch (error) {
        if (error instanceof ConsentRequiredError) {
          return reply.code(403).send({ code: "consent_required", requestId: request.id });
        }
        throw error;
      }

      return reply.code(202).send({ status: "accepted" });
    });
  });
}
