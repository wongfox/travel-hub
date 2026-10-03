import type { FastifyInstance } from "fastify";
import { resolveTfeRedirectUrl, type TfeRedirectConfig } from "./resolve-tfe-redirect.js";

export interface OutboundRouteDeps {
  tfeConfig: TfeRedirectConfig;
}

/**
 * Registers `GET /api/out/tfe?placement=` (task 10.5, `complementary-
 * services-redirect`): a self-contained, allowlisted 302 — no session, no
 * feature flag, no passenger data. `placement` only ever indexes into the
 * configured allowlist (`resolveTfeRedirectUrl`); an unknown value is
 * rejected with 400 and never redirects anywhere (open-redirect-safety
 * acceptance criterion). Click-out event emission into `AnalyticsSinkPort`
 * is wired in task 12.2, per the design's own "wired fully in 12.2" note.
 */
export function registerOutboundRoutes(app: FastifyInstance, deps: OutboundRouteDeps): void {
  app.get<{ Querystring: { placement?: string } }>("/api/out/tfe", async (request, reply) => {
    const placement = request.query.placement;
    if (typeof placement !== "string" || placement.length === 0) {
      return reply.code(400).send({ code: "invalid_request", requestId: request.id });
    }

    const target = resolveTfeRedirectUrl(placement, deps.tfeConfig);
    if (!target) {
      return reply.code(400).send({ code: "invalid_request", requestId: request.id });
    }

    return reply.code(302).header("location", target).send();
  });
}
