import { z } from "zod";
import { ConsentPurposeSchema } from "contracts";
import type { FastifyInstance } from "fastify";
import { DEFAULT_SESSION_COOKIE_NAME } from "../trip-access/http.js";
import { resolveActiveSession, type ResolveSessionDeps } from "../trip-access/session-auth.js";
import { recordConsent } from "./record-consent.js";
import type { ConsentStore } from "./consent-store.js";
import type { PushSubscriptionStore } from "../notifications/ports.js";
import type { PiiAccessAuditPort } from "../../infra/audit/pii-access-audit.js";
import type { AnalyticsEventStore } from "../analytics/ports.js";

const RecordConsentBodySchema = z.object({
  purpose: ConsentPurposeSchema,
  textVersion: z.string().min(1),
  granted: z.boolean(),
});

export interface PrivacyRouteDeps extends ResolveSessionDeps {
  consentStore: ConsentStore;
  /** Consent-withdrawal cascade (task 12.3): omitted entirely, `POST /api/consents` behaves exactly as before this task. */
  pushSubscriptionStore?: Pick<PushSubscriptionStore, "deleteByReservation">;
  piiAccessAudit?: PiiAccessAuditPort;
  /** Analytics consent-withdrawal cascade: the shared analytics event store and trip-hash secret; omit both and withdrawal only records the consent. */
  analyticsEventStore?: Pick<AnalyticsEventStore, "deletePendingByTripHash">;
  analyticsSecret?: string;
  /** Overridable only for tests; production always shares `trip-access`'s `DEFAULT_SESSION_COOKIE_NAME`. */
  sessionCookieName?: string;
}

/**
 * Registers `POST /api/consents` (task 8.1, design-interfaces).
 * `personal-data-protection`'s "Consent before optional data use" and
 * `pre-check-in`'s "Explicit consent before capture" requirements both route
 * through this one endpoint: the passenger's session (`resolveActiveSession`,
 * shared with `trip`/`trip-access`) resolves which reservation the consent
 * applies to, so the request body never needs to carry a reservation
 * reference the passenger could spoof or reuse across sessions.
 */
export function registerPrivacyRoutes(app: FastifyInstance, deps: PrivacyRouteDeps): void {
  const cookieName = deps.sessionCookieName ?? DEFAULT_SESSION_COOKIE_NAME;

  app.post("/api/consents", async (request, reply) => {
    const raw = request.cookies[cookieName];
    const session = await resolveActiveSession(raw, deps);
    if (!session) {
      return reply.code(401).send({ code: "link_expired", requestId: request.id });
    }

    const parsed = RecordConsentBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: "invalid_request", requestId: request.id });
    }

    const state = await recordConsent(
      {
        linkId: session.accessLink.id,
        reservationRef: session.accessLink.reservationRef,
        purpose: parsed.data.purpose,
        textVersion: parsed.data.textVersion,
        granted: parsed.data.granted,
      },
      {
        consentStore: deps.consentStore,
        ...(deps.pushSubscriptionStore ? { pushSubscriptionStore: deps.pushSubscriptionStore } : {}),
        ...(deps.piiAccessAudit ? { piiAccessAudit: deps.piiAccessAudit } : {}),
        ...(deps.analyticsEventStore ? { analyticsEventStore: deps.analyticsEventStore } : {}),
        ...(deps.analyticsSecret ? { analyticsSecret: deps.analyticsSecret } : {}),
      },
    );

    return reply.code(201).send(state);
  });
}
