import { z } from "zod";
import { LocaleSchema } from "contracts";
import type { FastifyInstance } from "fastify";
import { issueAccessLink, type IssueLinkDeps } from "./issue-link.js";
import { exchangeAccessToken, SessionExchangeError } from "./exchange-token.js";
import { reissueAccessLink } from "./reissue-link.js";
import { hashAccessToken } from "./token.js";
import type { SessionStore } from "./session-store.js";
import type { RateLimiter } from "./rate-limiter.js";
import type { SirBookingPort } from "../booking/ports.js";
import type { PushSubscriptionStore } from "../notifications/ports.js";

const ContactChannelSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("email"), address: z.string().min(1) }),
  z.object({ kind: z.literal("sms"), address: z.string().min(1) }),
  z.object({ kind: z.literal("whatsapp"), address: z.string().min(1) }),
]);

const IssueLinkRequestSchema = z.object({
  reservationRef: z.string().min(1),
  passengerScope: z.array(z.string().min(1)).optional(),
  contact: ContactChannelSchema,
  locale: LocaleSchema,
});

const SessionExchangeRequestSchema = z.object({
  token: z.string().min(1),
  locale: LocaleSchema.optional(),
});

const ReissueRequestSchema = z.object({
  reservationRef: z.string().min(1),
  surname: z.string().min(1),
  locale: LocaleSchema,
});

/**
 * `__Host-` prefixed per design Decision 4: the browser enforces Secure,
 * `Path=/`, and no `Domain` attribute for any cookie using this prefix,
 * keeping the session credential out of JS (HttpOnly) and scoped to this
 * exact origin.
 */
export const DEFAULT_SESSION_COOKIE_NAME = "__Host-th_sess";

export interface TripAccessRouteDeps extends IssueLinkDeps {
  /**
   * Shared-secret service credential checked against the `Authorization:
   * Bearer <key>` header. Design-interfaces documents this route as
   * "service-authenticated (mTLS or signed service token), not
   * internet-exposed via CDN" without picking one mechanism; this is the
   * signed-service-token half of that (mTLS/network isolation is an infra
   * concern for the CDN/ALB layer, task 13.2's scope, not this app route).
   */
  internalApiKey: string;
  sessionStore: SessionStore;
  /** Only the one method reissue needs — narrowed so this module never depends on the whole `SirBookingPort`. */
  sirBooking: Pick<SirBookingPort, "getContactForLinkDelivery">;
  /** Sliding session lifetime cap in ms (design Decision 4: `min(sliding 7 days, link expiry)`). */
  sessionSlidingMs: number;
  sessionRateLimiter: RateLimiter;
  reissueRateLimiter: RateLimiter;
  /** Overridable only for tests; production always uses `DEFAULT_SESSION_COOKIE_NAME`. */
  sessionCookieName?: string;
  /** Task 11.1's reissue-invalidation acceptance; threaded straight through to `reissueAccessLink`. Optional so every caller that predates `push-notifications` keeps working unchanged. */
  pushSubscriptionStore?: Pick<PushSubscriptionStore, "deleteByLinkId">;
}

/**
 * Registers `POST /internal/links` (design-interfaces, task 5.2), the
 * passenger-facing session-exchange/bootstrap/forget-device routes at
 * `/api/session` (task 5.3), and the re-request route `POST
 * /api/links/reissue` (task 5.4).
 */
export function registerTripAccessRoutes(app: FastifyInstance, deps: TripAccessRouteDeps): void {
  const cookieName = deps.sessionCookieName ?? DEFAULT_SESSION_COOKIE_NAME;

  app.post("/internal/links", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (authHeader !== `Bearer ${deps.internalApiKey}`) {
      return reply.code(401).send({ code: "unauthorized", requestId: request.id });
    }

    const parsed = IssueLinkRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: "invalid_request", requestId: request.id });
    }

    const { passengerScope, ...rest } = parsed.data;
    const result = await issueAccessLink(
      { ...rest, ...(passengerScope !== undefined ? { passengerScope } : {}) },
      deps,
    );
    return reply.code(201).send(result);
  });

  app.post("/api/session", async (request, reply) => {
    if (!deps.sessionRateLimiter.consume(request.ip)) {
      return reply.code(429).send({ error: "rate_limited" });
    }

    const parsed = SessionExchangeRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: "invalid_request", requestId: request.id });
    }

    try {
      const result = await exchangeAccessToken(parsed.data.token, parsed.data.locale, {
        accessLinkStore: deps.store,
        sessionStore: deps.sessionStore,
        sessionSlidingMs: deps.sessionSlidingMs,
        ...(deps.now ? { now: deps.now } : {}),
      });

      reply.setCookie(cookieName, result.sessionId, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
      });
      return reply.code(200).send({ expiresAt: result.expiresAt });
    } catch (error) {
      if (error instanceof SessionExchangeError) {
        return reply.code(401).send({ code: error.reason, requestId: request.id });
      }
      throw error;
    }
  });

  app.get("/api/session", async (request, reply) => {
    const raw = request.cookies[cookieName];
    if (!raw) {
      return reply.code(401).send({ code: "link_expired", requestId: request.id });
    }

    const now = deps.now ? deps.now() : new Date();
    const record = await deps.sessionStore.findByIdHash(hashAccessToken(raw));
    if (!record || new Date(record.expiresAt).getTime() <= now.getTime()) {
      reply.clearCookie(cookieName, { path: "/" });
      return reply.code(401).send({ code: "link_expired", requestId: request.id });
    }

    return reply.code(200).send({ locale: record.locale, expiresAt: record.expiresAt });
  });

  app.delete("/api/session", async (request, reply) => {
    const raw = request.cookies[cookieName];
    if (raw) {
      await deps.sessionStore.deleteByIdHash(hashAccessToken(raw));
    }
    reply.clearCookie(cookieName, { path: "/" });
    return reply.code(204).send();
  });

  app.post("/api/links/reissue", async (request, reply) => {
    if (!deps.reissueRateLimiter.consume(request.ip)) {
      return reply.code(429).send({ error: "rate_limited" });
    }

    const parsed = ReissueRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: "invalid_request", requestId: request.id });
    }

    await reissueAccessLink(parsed.data, {
      sirBooking: deps.sirBooking,
      store: deps.store,
      linkDelivery: deps.linkDelivery,
      linkExpiryMs: deps.linkExpiryMs,
      buildLinkUrl: deps.buildLinkUrl,
      ...(deps.now ? { now: deps.now } : {}),
      ...(deps.pushSubscriptionStore ? { pushSubscriptionStore: deps.pushSubscriptionStore } : {}),
    });
    // Always 202 with the same body, regardless of whether the verifier
    // matched a reservation — no enumeration signal (spec "Re-request with
    // non-matching inputs").
    return reply.code(202).send({ status: "accepted" });
  });
}
