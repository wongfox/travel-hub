import { PulsePromptRequestSchema, SubmitPulseRequestSchema } from "contracts";
import type { FastifyInstance } from "fastify";
import { DEFAULT_SESSION_COOKIE_NAME } from "../trip-access/http.js";
import { resolveActiveSession, type ResolveSessionDeps } from "../trip-access/session-auth.js";
import { ConsentRequiredError, assertConsentGranted } from "../privacy/consent-guard.js";
import type { ConsentStore } from "../privacy/consent-store.js";
import type { SirBookingPort } from "../booking/ports.js";
import type { PushSubscriptionStore, WebPushPort } from "../notifications/ports.js";
import { FLAG_DEFAULTS, type FlagKey } from "../../config/flags.js";
import { submitPulseResponse } from "./submit-pulse-response.js";
import { deliverPulsePrompt } from "./deliver-pulse-prompt.js";
import type { NegativePulseRule } from "./negative-pulse-rule.js";
import {
  DuplicatePulseResponseError,
  type PulsePromptDeliveryStore,
  type PulseResponseStore,
  type StaffAlertStore,
} from "./ports.js";

export interface PulseRouteDeps extends ResolveSessionDeps {
  sirBooking: Pick<SirBookingPort, "getReservation">;
  consentStore: Pick<ConsentStore, "findLatest">;
  pulseResponseStore: Pick<PulseResponseStore, "create">;
  staffAlertStore: Pick<StaffAlertStore, "create">;
  pulsePromptDeliveryStore: Pick<PulsePromptDeliveryStore, "create">;
  subscriptionStore: Pick<PushSubscriptionStore, "findActiveByReservation">;
  webPush: WebPushPort;
  negativePulseRule: NegativePulseRule;
  /** Server-side flag table; defaults to the compiled-in defaults (task 3.2) when omitted. */
  flags?: Record<FlagKey, boolean>;
  /** Overridable only for tests; production always shares `trip-access`'s `DEFAULT_SESSION_COOKIE_NAME`. */
  sessionCookieName?: string;
}

/**
 * Registers `POST /api/pulse` (tasks 11.4-11.5) and `POST /api/pulse/prompt`
 * (task 11.6). Both routes share the `pulse.capture` flag — prompting for a
 * response makes no sense while capture itself is disabled.
 */
export function registerPulseRoutes(app: FastifyInstance, deps: PulseRouteDeps): void {
  const cookieName = deps.sessionCookieName ?? DEFAULT_SESSION_COOKIE_NAME;

  async function requireSessionAndFlag(request: { cookies: Record<string, string | undefined> }) {
    const flags = deps.flags ?? FLAG_DEFAULTS;
    if (!flags["pulse.capture"]) {
      return { error: "feature_disabled" as const };
    }
    const raw = request.cookies[cookieName];
    const session = await resolveActiveSession(raw, deps);
    if (!session) {
      return { error: "link_expired" as const };
    }
    return { session };
  }

  app.post("/api/pulse", async (request, reply) => {
    const resolved = await requireSessionAndFlag(request);
    if ("error" in resolved) {
      return reply.code(resolved.error === "feature_disabled" ? 403 : 401).send({
        code: resolved.error,
        requestId: request.id,
      });
    }
    const { session } = resolved;

    const parsed = SubmitPulseRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: "invalid_request", requestId: request.id });
    }

    try {
      await assertConsentGranted({ consentStore: deps.consentStore }, session.accessLink.reservationRef, null, "pulse");
    } catch (error) {
      if (error instanceof ConsentRequiredError) {
        return reply.code(403).send({ code: "consent_required", requestId: request.id });
      }
      throw error;
    }

    const reservation = await deps.sirBooking.getReservation({ reservationRef: session.accessLink.reservationRef });
    const scopedPassenger =
      session.accessLink.passengerScope.length === 0
        ? reservation.passengers[0]
        : reservation.passengers.find((passenger) => session.accessLink.passengerScope.includes(passenger.passengerRef));
    if (!scopedPassenger) {
      return reply.code(403).send({ code: "out_of_scope", requestId: request.id });
    }

    const leg = reservation.legs.find((candidate) => candidate.legRef === parsed.data.legId);
    if (!leg) {
      return reply.code(400).send({ code: "invalid_request", requestId: request.id });
    }

    const otherLegs = reservation.legs.filter((candidate) => candidate.legRef !== leg.legRef);
    // Narrow implementation choice (spec leaves "return-leg-pending" TBD): any
    // other leg not yet completed/cancelled counts as a pending return leg.
    const hasReturnLegPending = otherLegs.some(
      (candidate) => candidate.status !== "COMPLETED" && candidate.status !== "CANCELLED",
    );
    const returnLeg = otherLegs[0] ?? null;

    const flags = deps.flags ?? FLAG_DEFAULTS;

    try {
      await submitPulseResponse(
        {
          reservationRef: session.accessLink.reservationRef,
          passengerRef: scopedPassenger.passengerRef,
          passengerOrdinal: scopedPassenger.ordinal,
          legRef: leg.legRef,
          leg: { origin: leg.origin, destination: leg.destination, departureLocal: leg.departureLocal },
          returnLeg: returnLeg ? { departureLocal: returnLeg.departureLocal } : null,
          serviceTier: leg.tier,
          score: parsed.data.score,
          scaleMax: 5,
          locale: session.locale,
          hasReturnLegPending,
        },
        {
          pulseResponseStore: deps.pulseResponseStore,
          staffAlertStore: deps.staffAlertStore,
          negativePulseRule: deps.negativePulseRule,
          staffAlertsEnabled: flags["pulse.staff_alerts"],
        },
      );
    } catch (error) {
      if (error instanceof DuplicatePulseResponseError) {
        return reply.code(409).send({ code: "already_submitted", requestId: request.id });
      }
      throw error;
    }

    return reply.code(201).send({ status: "received" });
  });

  app.post("/api/pulse/prompt", async (request, reply) => {
    const resolved = await requireSessionAndFlag(request);
    if ("error" in resolved) {
      return reply.code(resolved.error === "feature_disabled" ? 403 : 401).send({
        code: resolved.error,
        requestId: request.id,
      });
    }
    const { session } = resolved;

    const parsed = PulsePromptRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: "invalid_request", requestId: request.id });
    }

    // Best-effort, always: a repeated request for the same (reservation, leg)
    // is a harmless no-op (`DuplicatePulsePromptDeliveryError`, swallowed by
    // the idempotency store itself below), and any `deliverPulsePrompt`
    // failure never surfaces as an error response — the in-app prompt
    // (always delivered, since the passenger is already on the page that
    // triggered this call) is the baseline; push is an additive nudge
    // (task 11.6).
    try {
      await deps.pulsePromptDeliveryStore.create(session.accessLink.reservationRef, parsed.data.legId);
      await deliverPulsePrompt(
        { reservationRef: session.accessLink.reservationRef, legId: parsed.data.legId, locale: session.locale },
        { subscriptionStore: deps.subscriptionStore, webPush: deps.webPush },
      );
    } catch {
      // Swallowed intentionally — see comment above.
    }

    return reply.code(202).send({ status: "requested" });
  });
}
