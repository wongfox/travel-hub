import type { FastifyInstance } from "fastify";
import { resolveTfeRedirectUrl, type TfeRedirectConfig } from "./resolve-tfe-redirect.js";
import { DEFAULT_SESSION_COOKIE_NAME } from "../trip-access/http.js";
import { resolveActiveSession, type ResolveSessionDeps } from "../trip-access/session-auth.js";
import type { AnalyticsRecorder } from "../analytics/analytics-recorder.js";
import { recordAnalyticsBestEffort } from "../analytics/analytics-recorder.js";

export interface OutboundRouteDeps extends Partial<ResolveSessionDeps> {
  tfeConfig: TfeRedirectConfig;
  /** `usage-analytics` click-out instrumentation (task 12.2); omitted entirely, this route behaves exactly as before this task. */
  analytics?: Pick<AnalyticsRecorder, "record">;
  /** Overridable only for tests; production always shares `trip-access`'s `DEFAULT_SESSION_COOKIE_NAME`. */
  sessionCookieName?: string;
}

/**
 * Registers `GET /api/out/tfe?placement=` (task 10.5, `complementary-
 * services-redirect`): a self-contained, allowlisted 302 — no session, no
 * feature flag, no passenger data, REQUIRED. `placement` only ever indexes
 * into the configured allowlist (`resolveTfeRedirectUrl`); an unknown value
 * is rejected with 400 and never redirects anywhere (open-redirect-safety
 * acceptance criterion).
 *
 * Task 12.2's "a TFE click-out event is recorded with the trip/session
 * context" is satisfied best-effort: when `sessionStore`/`accessLinkStore`
 * are given AND the request happens to carry a still-valid session cookie,
 * the click-out event is attributed to that reservation. Session resolution
 * here is optional and NEVER blocks or alters the redirect itself (unlike
 * every other session-gated route in this codebase) — an unresolvable or
 * absent session simply means no analytics event is recorded for this
 * click, consistent with this route's own pre-existing "no session
 * required" design.
 */
export function registerOutboundRoutes(app: FastifyInstance, deps: OutboundRouteDeps): void {
  const cookieName = deps.sessionCookieName ?? DEFAULT_SESSION_COOKIE_NAME;

  app.get<{ Querystring: { placement?: string } }>("/api/out/tfe", async (request, reply) => {
    const placement = request.query.placement;
    if (typeof placement !== "string" || placement.length === 0) {
      return reply.code(400).send({ code: "invalid_request", requestId: request.id });
    }

    const target = resolveTfeRedirectUrl(placement, deps.tfeConfig);
    if (!target) {
      return reply.code(400).send({ code: "invalid_request", requestId: request.id });
    }

    if (deps.sessionStore && deps.accessLinkStore) {
      const raw = request.cookies[cookieName];
      const session = await resolveActiveSession(raw, {
        sessionStore: deps.sessionStore,
        accessLinkStore: deps.accessLinkStore,
      });
      if (session) {
        await recordAnalyticsBestEffort(deps.analytics, {
          reservationRef: session.accessLink.reservationRef,
          name: "tfe_click_out",
          props: { placement },
        });
      }
    }

    return reply.code(302).header("location", target).send();
  });
}
