import type { FastifyInstance } from "fastify";
import { CreateWifiOrderRequestSchema, type WifiOrderDTO } from "contracts";
import { DEFAULT_SESSION_COOKIE_NAME } from "../trip-access/http.js";
import { resolveActiveSession, type ResolveSessionDeps } from "../trip-access/session-auth.js";
import { FLAG_DEFAULTS, type FlagKey } from "../../config/flags.js";
import type { SirBookingPort } from "../booking/ports.js";
import { resolveTripOverallTier } from "../trip/resolve-trip-tier.js";
import { selectNextMilestone } from "../trip/select-next-milestone.js";
import { listWifiPackages } from "./list-wifi-packages.js";
import { createWifiOrder } from "./create-wifi-order.js";
import { handlePaymentWebhook } from "./handle-payment-webhook.js";
import { InvalidWebhookSignatureError, WifiOrderNotFoundError, WifiPackageNotFoundError } from "./errors.js";
import type { PaymentGatewayPort, WifiOrderRecord, WifiOrderStore, WifiPackageStore } from "./ports.js";

export interface WifiCheckoutRouteDeps extends ResolveSessionDeps {
  sirBooking: Pick<SirBookingPort, "getReservation">;
  orderStore: WifiOrderStore;
  packageStore: Pick<WifiPackageStore, "listActive" | "findById">;
  paymentGateway: PaymentGatewayPort;
  /** Server-side flag table; defaults to the compiled-in defaults (task 3.2) when omitted. */
  flags?: Record<FlagKey, boolean>;
  /** Builds the return URL the passenger lands on after the gateway's hosted page; dev-only default when omitted. */
  buildReturnUrl?: (idempotencyKey: string) => string;
  /** Overridable only for tests; production always shares `trip-access`'s `DEFAULT_SESSION_COOKIE_NAME`. */
  sessionCookieName?: string;
}

function toWifiOrderDTO(order: WifiOrderRecord): WifiOrderDTO {
  return {
    id: order.id,
    packageId: order.packageId,
    status: order.status,
    amountMinor: order.amountMinor,
    currency: order.currency,
    // Independent flags per design Decision 8 (task 10.3): reflect the
    // order's own entitlement/SIR/receipt fields, driven by
    // `wifi-order-jobs.ts`'s activation/SIR-registration/e-receipt scans.
    sirRegistered: order.sirRegisteredAt !== null,
    receiptIssued: order.receiptIssuedAt !== null,
    entitlementRef: order.entitlementRef,
    entitlementExpiresAt: order.entitlementExpiresAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

function normalizeHeaders(raw: Record<string, unknown>): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") headers[key] = value;
  }
  return headers;
}

/**
 * Registers `GET /api/wifi/packages` and `POST /api/wifi/orders` (task
 * 10.1), plus `GET /api/wifi/orders/:id` and `POST
 * /webhooks/payments/:provider` (task 10.2). The webhook route is
 * service-to-service (the payment gateway, not a passenger session) and is
 * registered in its own encapsulated Fastify context so only it gets a
 * raw-`Buffer` body parser — `PaymentGatewayPort.parseWebhook` verifies the
 * signature over the exact bytes the gateway sent, which a pre-parsed JSON
 * object cannot reproduce. Every other route here keeps Fastify's default
 * JSON body parsing, unaffected by this override.
 */
export function registerWifiCheckoutRoutes(app: FastifyInstance, deps: WifiCheckoutRouteDeps): void {
  const cookieName = deps.sessionCookieName ?? DEFAULT_SESSION_COOKIE_NAME;
  const flags = deps.flags ?? FLAG_DEFAULTS;
  const buildReturnUrl =
    deps.buildReturnUrl ?? ((idempotencyKey: string) => `https://app.travel-hub.local/trip/wifi?order=${idempotencyKey}`);

  async function requireSession(request: { cookies: Record<string, string | undefined> }) {
    const raw = request.cookies[cookieName];
    return resolveActiveSession(raw, deps);
  }

  app.get("/api/wifi/packages", async (request, reply) => {
    if (!flags["wifi.checkout"]) {
      return reply.code(403).send({ code: "feature_disabled", requestId: request.id });
    }
    const session = await requireSession(request);
    if (!session) {
      return reply.code(401).send({ code: "link_expired", requestId: request.id });
    }

    const reservation = await deps.sirBooking.getReservation({ reservationRef: session.accessLink.reservationRef });
    const nextMilestone = selectNextMilestone(reservation.legs);
    const tier = resolveTripOverallTier(reservation.legs, nextMilestone?.legId ?? null);

    const packages = await listWifiPackages(tier, session.locale, { packageStore: deps.packageStore });
    return reply.code(200).send(packages);
  });

  app.post("/api/wifi/orders", async (request, reply) => {
    if (!flags["wifi.checkout"]) {
      return reply.code(403).send({ code: "feature_disabled", requestId: request.id });
    }
    const session = await requireSession(request);
    if (!session) {
      return reply.code(401).send({ code: "link_expired", requestId: request.id });
    }

    const idempotencyKey = request.headers["idempotency-key"];
    if (typeof idempotencyKey !== "string" || idempotencyKey.length === 0) {
      return reply.code(400).send({ code: "invalid_request", requestId: request.id });
    }

    const parsed = CreateWifiOrderRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: "invalid_request", requestId: request.id });
    }

    const reservation = await deps.sirBooking.getReservation({ reservationRef: session.accessLink.reservationRef });
    const scopedPassenger =
      session.accessLink.passengerScope.length === 0
        ? reservation.passengers[0]
        : reservation.passengers.find((passenger) => session.accessLink.passengerScope.includes(passenger.passengerRef));
    if (!scopedPassenger) {
      return reply.code(403).send({ code: "out_of_scope", requestId: request.id });
    }

    // The leg this WiFi entitlement binds to (task 10.3): same next-milestone
    // leg already used for the catalog's tier resolution above.
    const orderNextMilestone = selectNextMilestone(reservation.legs);
    // The spec is silent on orders without these; an order without a leg can
    // never be entitled and one without an email can never get its e-receipt,
    // so creation is rejected up front instead of persisting empty strings.
    const buyerEmail = reservation.contact.kind === "email" ? reservation.contact.address.trim() : "";
    if (!orderNextMilestone || buyerEmail.length === 0) {
      return reply.code(422).send({ code: "invalid_request", requestId: request.id });
    }
    const legRef = orderNextMilestone.legId;

    try {
      const { order, redirectUrl } = await createWifiOrder(
        {
          reservationRef: session.accessLink.reservationRef,
          passengerRef: scopedPassenger.passengerRef,
          packageId: parsed.data.packageId,
          idempotencyKey,
          locale: session.locale,
          returnUrl: buildReturnUrl(idempotencyKey),
          legRef,
          buyerEmail,
        },
        { orderStore: deps.orderStore, packageStore: deps.packageStore, paymentGateway: deps.paymentGateway },
      );
      return reply.code(201).send({ order: toWifiOrderDTO(order), redirectUrl });
    } catch (error) {
      if (error instanceof WifiPackageNotFoundError) {
        return reply.code(400).send({ code: "invalid_request", requestId: request.id });
      }
      throw error;
    }
  });

  app.get<{ Params: { id: string } }>("/api/wifi/orders/:id", async (request, reply) => {
    if (!flags["wifi.checkout"]) {
      return reply.code(403).send({ code: "feature_disabled", requestId: request.id });
    }
    const session = await requireSession(request);
    if (!session) {
      return reply.code(401).send({ code: "link_expired", requestId: request.id });
    }

    const order = await deps.orderStore.findById(request.params.id);
    if (!order || order.reservationRef !== session.accessLink.reservationRef) {
      return reply.code(404).send({ code: "not_found", requestId: request.id });
    }

    return reply.code(200).send(toWifiOrderDTO(order));
  });

  void app.register(async (instance) => {
    instance.addContentTypeParser("application/json", { parseAs: "buffer" }, (_request, body, done) => {
      done(null, body as Buffer);
    });

    instance.post<{ Params: { provider: string } }>("/webhooks/payments/:provider", async (request, reply) => {
      try {
        await handlePaymentWebhook(request.body as Buffer, normalizeHeaders(request.headers), {
          paymentGateway: deps.paymentGateway,
          orderStore: deps.orderStore,
        });
        return reply.code(200).send({ status: "ok" });
      } catch (error) {
        if (error instanceof WifiOrderNotFoundError) {
          return reply.code(404).send({ code: "not_found", requestId: request.id });
        }
        if (error instanceof InvalidWebhookSignatureError) {
          // RED-worthy acceptance (task 10.2): rejected without ever
          // touching order state.
          return reply.code(400).send({ code: "invalid_request", requestId: request.id });
        }
        // Any other failure (a transient store error, etc.) is NOT the
        // client's fault: a 4xx tells the gateway to stop retrying a payment
        // confirmation it should keep retrying, so this propagates to
        // Fastify's default 500 instead of masquerading as invalid_request.
        throw error;
      }
    });
  });
}
