import { PushSubscriptionRequestSchema } from "contracts";
import type { FastifyInstance } from "fastify";
import { DEFAULT_SESSION_COOKIE_NAME } from "../trip-access/http.js";
import { resolveActiveSession, type ResolveSessionDeps } from "../trip-access/session-auth.js";
import { ConsentRequiredError } from "../privacy/consent-guard.js";
import type { ConsentStore } from "../privacy/consent-store.js";
import { FLAG_DEFAULTS, type FlagKey } from "../../config/flags.js";
import { subscribePush } from "./subscribe-push.js";
import type { PushSubscriptionStore } from "./ports.js";
import type { AnalyticsRecorder } from "../analytics/analytics-recorder.js";

export interface NotificationRouteDeps extends ResolveSessionDeps {
  consentStore: Pick<ConsentStore, "findLatest">;
  subscriptionStore: PushSubscriptionStore;
  /** Server-side flag table; defaults to the compiled-in defaults (task 3.2) when omitted. */
  flags?: Record<FlagKey, boolean>;
  /** `usage-analytics` push opt-in instrumentation (task 12.2); omitted entirely, these routes behave exactly as before this task. */
  analytics?: Pick<AnalyticsRecorder, "record">;
  /** Overridable only for tests; production always shares `trip-access`'s `DEFAULT_SESSION_COOKIE_NAME`. */
  sessionCookieName?: string;
}

/**
 * Registers `POST /api/push/subscriptions` and `DELETE
 * /api/push/subscriptions/:id` (task 11.1). `Cache-Control: no-store` on
 * both is already enforced defense-in-depth by `registerSecurityPlugins`'s
 * `isSensitiveRoute` hook (task 7.2's `/api/push/**` denylist entry) — this
 * module adds no separate header logic for that.
 */
export function registerNotificationRoutes(app: FastifyInstance, deps: NotificationRouteDeps): void {
  const cookieName = deps.sessionCookieName ?? DEFAULT_SESSION_COOKIE_NAME;

  app.post("/api/push/subscriptions", async (request, reply) => {
    const flags = deps.flags ?? FLAG_DEFAULTS;
    if (!flags["push.enabled"]) {
      return reply.code(403).send({ code: "feature_disabled", requestId: request.id });
    }

    const raw = request.cookies[cookieName];
    const session = await resolveActiveSession(raw, deps);
    if (!session) {
      return reply.code(401).send({ code: "link_expired", requestId: request.id });
    }

    const parsed = PushSubscriptionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: "invalid_request", requestId: request.id });
    }

    try {
      const subscription = await subscribePush(
        {
          linkId: session.accessLink.id,
          reservationRef: session.accessLink.reservationRef,
          passengerScope: session.accessLink.passengerScope,
          endpoint: parsed.data.endpoint,
          p256dh: parsed.data.keys.p256dh,
          auth: parsed.data.keys.auth,
          locale: parsed.data.locale,
          expiresAt: session.accessLink.expiresAt,
        },
        {
          consentStore: deps.consentStore,
          subscriptionStore: deps.subscriptionStore,
          ...(deps.analytics ? { analytics: deps.analytics } : {}),
        },
      );
      return reply.code(201).send({ id: subscription.id, expiresAt: subscription.expiresAt });
    } catch (error) {
      if (error instanceof ConsentRequiredError) {
        return reply.code(403).send({ code: "consent_required", requestId: request.id });
      }
      throw error;
    }
  });

  app.delete<{ Params: { id: string } }>("/api/push/subscriptions/:id", async (request, reply) => {
    const flags = deps.flags ?? FLAG_DEFAULTS;
    if (!flags["push.enabled"]) {
      return reply.code(403).send({ code: "feature_disabled", requestId: request.id });
    }

    const raw = request.cookies[cookieName];
    const session = await resolveActiveSession(raw, deps);
    if (!session) {
      return reply.code(401).send({ code: "link_expired", requestId: request.id });
    }

    const subscription = await deps.subscriptionStore.findById(request.params.id);
    if (!subscription || subscription.linkId !== session.accessLink.id) {
      return reply.code(404).send({ code: "not_found", requestId: request.id });
    }

    await deps.subscriptionStore.deleteById(subscription.id);
    return reply.code(204).send();
  });
}
