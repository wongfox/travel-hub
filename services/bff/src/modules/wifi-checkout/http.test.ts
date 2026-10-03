import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import { describe, expect, it } from "vitest";
import { registerWifiCheckoutRoutes } from "./http.js";
import { createInMemoryWifiOrderStore } from "./wifi-order-store.js";
import { createWifiPackageStub } from "../../adapters/wifi-package/stub.js";
import { createPaymentGatewayStub } from "../../adapters/payment-gateway/stub.js";
import { DEFAULT_SESSION_COOKIE_NAME } from "../trip-access/http.js";
import { createInMemoryAccessLinkStore, type AccessLinkStore } from "../trip-access/access-link-store.js";
import { createInMemorySessionStore, type SessionStore } from "../trip-access/session-store.js";
import { generateAccessToken, hashAccessToken } from "../trip-access/token.js";
import { FLAG_DEFAULTS, type FlagKey } from "../../config/flags.js";
import type { SirBookingPort, SirReservation } from "../booking/ports.js";
import type { WifiOrderStore } from "./ports.js";

const reservation: SirReservation = {
  reservationRef: "RES-1001",
  contact: { kind: "email", address: "ana@example.com" },
  passengers: [{ passengerRef: "PAX-1", ordinal: 1, displayName: "Ana Quispe" }],
  legs: [
    {
      legRef: "L1",
      origin: "Ollantaytambo",
      destination: "Machu Picchu Pueblo",
      departureLocal: "2026-11-02T08:10:00-05:00",
      arrivalLocal: "2026-11-02T09:40:00-05:00",
      tier: "VOYAGER",
      status: "SCHEDULED",
      seat: "5A",
      coach: "3",
      barcodeFormat: "CODE128",
      barcodePayload: "BP-L1",
    },
  ],
  tickets: [],
};

function fakeSirBooking(current: SirReservation = reservation): Pick<SirBookingPort, "getReservation"> {
  return {
    async getReservation() {
      return current;
    },
  };
}

async function buildTestApp(
  flags: Partial<Record<FlagKey, boolean>> = {},
  reservationOverride: SirReservation = reservation,
): Promise<{
  app: FastifyInstance;
  accessLinkStore: AccessLinkStore;
  sessionStore: SessionStore;
  orderStore: WifiOrderStore;
  paymentGateway: ReturnType<typeof createPaymentGatewayStub>;
}> {
  const app = Fastify();
  await app.register(cookie);
  const accessLinkStore = createInMemoryAccessLinkStore();
  const sessionStore = createInMemorySessionStore();
  const orderStore = createInMemoryWifiOrderStore();
  const paymentGateway = createPaymentGatewayStub();
  registerWifiCheckoutRoutes(app, {
    accessLinkStore,
    sessionStore,
    sirBooking: fakeSirBooking(reservationOverride),
    orderStore,
    packageStore: createWifiPackageStub(),
    paymentGateway,
    flags: { ...FLAG_DEFAULTS, ...flags },
  });
  await app.ready();
  return { app, accessLinkStore, sessionStore, orderStore, paymentGateway };
}

async function seedValidSession(
  accessLinkStore: AccessLinkStore,
  sessionStore: SessionStore,
  passengerScope: string[] = [],
): Promise<string> {
  const link = await accessLinkStore.create({
    tokenHash: hashAccessToken(generateAccessToken()),
    reservationRef: "RES-1001",
    passengerScope,
    expiresAt: "2027-01-01T00:00:00.000Z",
    issueChannel: "email",
  });
  const rawSessionId = generateAccessToken();
  await sessionStore.create(hashAccessToken(rawSessionId), {
    linkId: link.id,
    expiresAt: "2027-01-01T00:00:00.000Z",
    locale: "es",
  });
  return rawSessionId;
}

describe("GET /api/wifi/packages", () => {
  it("returns 403 feature_disabled when wifi.checkout is off", async () => {
    const { app, accessLinkStore, sessionStore } = await buildTestApp({ "wifi.checkout": false });
    const rawSessionId = await seedValidSession(accessLinkStore, sessionStore);

    const response = await app.inject({
      method: "GET",
      url: "/api/wifi/packages",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: rawSessionId },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "feature_disabled" });
  });

  it("returns 401 link_expired with no session cookie, even when the flag is on", async () => {
    const { app } = await buildTestApp({ "wifi.checkout": true });

    const response = await app.inject({ method: "GET", url: "/api/wifi/packages" });

    expect(response.statusCode).toBe(401);
  });

  it("returns the tier-scoped package catalog end to end", async () => {
    const { app, accessLinkStore, sessionStore } = await buildTestApp({ "wifi.checkout": true });
    const rawSessionId = await seedValidSession(accessLinkStore, sessionStore);

    const response = await app.inject({
      method: "GET",
      url: "/api/wifi/packages",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: rawSessionId },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as unknown[];
    expect(body.length).toBeGreaterThan(0);
  });
});

describe("POST /api/wifi/orders", () => {
  it("returns 403 feature_disabled when wifi.checkout is off", async () => {
    const { app, accessLinkStore, sessionStore } = await buildTestApp({ "wifi.checkout": false });
    const rawSessionId = await seedValidSession(accessLinkStore, sessionStore);

    const response = await app.inject({
      method: "POST",
      url: "/api/wifi/orders",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: rawSessionId },
      headers: { "idempotency-key": "idem-1" },
      payload: { packageId: "WIFI-60" },
    });

    expect(response.statusCode).toBe(403);
  });

  it("returns 400 invalid_request when the Idempotency-Key header is missing", async () => {
    const { app, accessLinkStore, sessionStore } = await buildTestApp({ "wifi.checkout": true });
    const rawSessionId = await seedValidSession(accessLinkStore, sessionStore);

    const response = await app.inject({
      method: "POST",
      url: "/api/wifi/orders",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: rawSessionId },
      payload: { packageId: "WIFI-60" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "invalid_request" });
  });

  it("creates an order and returns a redirect URL end to end", async () => {
    const { app, accessLinkStore, sessionStore } = await buildTestApp({ "wifi.checkout": true });
    const rawSessionId = await seedValidSession(accessLinkStore, sessionStore);

    const response = await app.inject({
      method: "POST",
      url: "/api/wifi/orders",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: rawSessionId },
      headers: { "idempotency-key": "idem-1" },
      payload: { packageId: "WIFI-60" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as { order: { status: string }; redirectUrl: string };
    expect(body.order.status).toBe("PAYMENT_PENDING");
    expect(body.redirectUrl).toMatch(/^https:\/\//);
  });

  it("acceptance: creating two orders with the same idempotency key produces one order, not two", async () => {
    const { app, accessLinkStore, sessionStore, orderStore } = await buildTestApp({ "wifi.checkout": true });
    const rawSessionId = await seedValidSession(accessLinkStore, sessionStore);

    const first = await app.inject({
      method: "POST",
      url: "/api/wifi/orders",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: rawSessionId },
      headers: { "idempotency-key": "same-key" },
      payload: { packageId: "WIFI-60" },
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/wifi/orders",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: rawSessionId },
      headers: { "idempotency-key": "same-key" },
      payload: { packageId: "WIFI-60" },
    });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    const firstBody = first.json() as { order: { id: string } };
    const secondBody = second.json() as { order: { id: string } };
    expect(secondBody.order.id).toBe(firstBody.order.id);
    expect(await orderStore.findByIdempotencyKey("same-key")).not.toBeNull();
  });

  it("resolves legRef from the reservation's next milestone and buyerEmail from its email contact (task 10.3)", async () => {
    const { app, accessLinkStore, sessionStore, orderStore } = await buildTestApp({ "wifi.checkout": true });
    const rawSessionId = await seedValidSession(accessLinkStore, sessionStore);

    const response = await app.inject({
      method: "POST",
      url: "/api/wifi/orders",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: rawSessionId },
      headers: { "idempotency-key": "idem-legref" },
      payload: { packageId: "WIFI-60" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as { order: { id: string } };
    const stored = await orderStore.findById(body.order.id);
    expect(stored?.legRef).toBe("L1");
    expect(stored?.buyerEmail).toBe("ana@example.com");
  });

  it("rejects order creation with 422 invalid_request when the reservation has no email contact, creating no order", async () => {
    const { app, accessLinkStore, sessionStore, orderStore } = await buildTestApp(
      { "wifi.checkout": true },
      { ...reservation, contact: { kind: "sms", address: "+51999999999" } },
    );
    const rawSessionId = await seedValidSession(accessLinkStore, sessionStore);

    const response = await app.inject({
      method: "POST",
      url: "/api/wifi/orders",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: rawSessionId },
      headers: { "idempotency-key": "idem-no-email" },
      payload: { packageId: "WIFI-60" },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: "invalid_request" });
    expect(await orderStore.findByIdempotencyKey("idem-no-email")).toBeNull();
  });

  it("rejects order creation with 422 invalid_request when no upcoming leg remains, creating no order", async () => {
    const { app, accessLinkStore, sessionStore, orderStore } = await buildTestApp(
      { "wifi.checkout": true },
      { ...reservation, legs: reservation.legs.map((leg) => ({ ...leg, status: "COMPLETED" as const })) },
    );
    const rawSessionId = await seedValidSession(accessLinkStore, sessionStore);

    const response = await app.inject({
      method: "POST",
      url: "/api/wifi/orders",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: rawSessionId },
      headers: { "idempotency-key": "idem-no-leg" },
      payload: { packageId: "WIFI-60" },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: "invalid_request" });
    expect(await orderStore.findByIdempotencyKey("idem-no-leg")).toBeNull();
  });
});

describe("GET /api/wifi/orders/:id", () => {
  it("returns 403 feature_disabled when wifi.checkout is off (R2-001)", async () => {
    const { app, accessLinkStore, sessionStore, orderStore } = await buildTestApp({ "wifi.checkout": false });
    const rawSessionId = await seedValidSession(accessLinkStore, sessionStore);
    const order = await orderStore.create({
      reservationRef: "RES-1001",
      passengerRef: "PAX-1",
      packageId: "WIFI-60",
      amountMinor: 1500,
      currency: "PEN",
      idempotencyKey: "idem-disabled-1",
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/wifi/orders/${order.id}`,
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: rawSessionId },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "feature_disabled" });
  });

  it("returns the order status end to end", async () => {
    const { app, accessLinkStore, sessionStore } = await buildTestApp({ "wifi.checkout": true });
    const rawSessionId = await seedValidSession(accessLinkStore, sessionStore);

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/wifi/orders",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: rawSessionId },
      headers: { "idempotency-key": "idem-status-1" },
      payload: { packageId: "WIFI-60" },
    });
    const { order } = createResponse.json() as { order: { id: string } };

    const statusResponse = await app.inject({
      method: "GET",
      url: `/api/wifi/orders/${order.id}`,
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: rawSessionId },
    });

    expect(statusResponse.statusCode).toBe(200);
    expect(statusResponse.json()).toMatchObject({ id: order.id, status: "PAYMENT_PENDING" });
  });

  it("reflects the order's real entitlement/SIR/receipt fields once activated (task 10.3)", async () => {
    const { app, accessLinkStore, sessionStore, orderStore } = await buildTestApp({ "wifi.checkout": true });
    const rawSessionId = await seedValidSession(accessLinkStore, sessionStore);
    const order = await orderStore.create({
      reservationRef: "RES-1001",
      passengerRef: "PAX-1",
      packageId: "WIFI-60",
      amountMinor: 1500,
      currency: "PEN",
      idempotencyKey: "idem-active-1",
    });
    await orderStore.transition(order.id, "ENTITLEMENT_ACTIVE", {
      entitlementRef: "ENT-1",
      entitlementExpiresAt: "2026-01-02T00:00:00.000Z",
      sirRegisteredAt: "2026-01-01T12:00:00.000Z",
      receiptIssuedAt: "2026-01-01T12:05:00.000Z",
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/wifi/orders/${order.id}`,
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: rawSessionId },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ENTITLEMENT_ACTIVE",
      entitlementRef: "ENT-1",
      entitlementExpiresAt: "2026-01-02T00:00:00.000Z",
      sirRegistered: true,
      receiptIssued: true,
    });
  });

  it("returns 404 for an order belonging to a different reservation", async () => {
    const { app, accessLinkStore, sessionStore, orderStore } = await buildTestApp({ "wifi.checkout": true });
    const rawSessionId = await seedValidSession(accessLinkStore, sessionStore);
    const otherOrder = await orderStore.create({
      reservationRef: "RES-OTHER",
      passengerRef: "PAX-OTHER",
      packageId: "WIFI-60",
      amountMinor: 1500,
      currency: "PEN",
      idempotencyKey: "other-key",
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/wifi/orders/${otherOrder.id}`,
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: rawSessionId },
    });

    expect(response.statusCode).toBe(404);
  });
});

describe("POST /webhooks/payments/:provider", () => {
  it("rejects a webhook with an invalid signature and never transitions order state (task 10.2 RED-worthy acceptance)", async () => {
    const { app, accessLinkStore, sessionStore, orderStore, paymentGateway } = await buildTestApp({
      "wifi.checkout": true,
    });
    const rawSessionId = await seedValidSession(accessLinkStore, sessionStore);
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/wifi/orders",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: rawSessionId },
      headers: { "idempotency-key": "idem-webhook-1" },
      payload: { packageId: "WIFI-60" },
    });
    const { order } = createResponse.json() as { order: { id: string } };

    const { rawBody, headers } = paymentGateway.buildWebhookRequest({
      type: "payment_succeeded",
      providerRef: "provider-ref-1",
      orderIdempotencyKey: "idem-webhook-1",
      amountMinor: 1500,
      currency: "PEN",
      tamperSignature: true,
    });

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/payments/stub-provider",
      headers: { "content-type": "application/json", ...headers },
      payload: rawBody,
    });

    expect(response.statusCode).toBe(400);
    const unchanged = await orderStore.findById(order.id);
    expect(unchanged?.status).toBe("PAYMENT_PENDING");
  });

  it("rejects a webhook with no signature header at all", async () => {
    const { app, paymentGateway } = await buildTestApp({ "wifi.checkout": true });

    const { rawBody } = paymentGateway.buildWebhookRequest({
      type: "payment_succeeded",
      providerRef: "provider-ref-2",
      orderIdempotencyKey: "idem-does-not-matter",
      amountMinor: 1500,
      currency: "PEN",
      omitSignature: true,
    });

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/payments/stub-provider",
      headers: { "content-type": "application/json" },
      payload: rawBody,
    });

    expect(response.statusCode).toBe(400);
  });

  it("propagates (never masks as 400) a genuine internal failure on a validly signed webhook, so the gateway keeps retrying (R4-001)", async () => {
    const paymentGateway = createPaymentGatewayStub();
    const realOrderStore = createInMemoryWifiOrderStore();
    const explodingOrderStore: WifiOrderStore = {
      ...realOrderStore,
      async findByIdempotencyKey() {
        throw new Error("simulated transient store failure");
      },
    };
    const app = Fastify();
    await app.register(cookie);
    registerWifiCheckoutRoutes(app, {
      accessLinkStore: createInMemoryAccessLinkStore(),
      sessionStore: createInMemorySessionStore(),
      sirBooking: fakeSirBooking(),
      orderStore: explodingOrderStore,
      packageStore: createWifiPackageStub(),
      paymentGateway,
      flags: { ...FLAG_DEFAULTS, "wifi.checkout": true },
    });
    await app.ready();

    const { rawBody, headers } = paymentGateway.buildWebhookRequest({
      type: "payment_succeeded",
      providerRef: "provider-ref-internal-error",
      orderIdempotencyKey: "idem-does-not-matter",
      amountMinor: 1500,
      currency: "PEN",
    });

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/payments/stub-provider",
      headers: { "content-type": "application/json", ...headers },
      payload: rawBody,
    });

    expect(response.statusCode).toBe(500);
  });

  it("transitions the order to PAID end to end on a validly signed payment_succeeded event", async () => {
    const { app, accessLinkStore, sessionStore, orderStore, paymentGateway } = await buildTestApp({
      "wifi.checkout": true,
    });
    const rawSessionId = await seedValidSession(accessLinkStore, sessionStore);
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/wifi/orders",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: rawSessionId },
      headers: { "idempotency-key": "idem-webhook-2" },
      payload: { packageId: "WIFI-60" },
    });
    const { order } = createResponse.json() as { order: { id: string } };

    const { rawBody, headers } = paymentGateway.buildWebhookRequest({
      type: "payment_succeeded",
      providerRef: "provider-ref-3",
      orderIdempotencyKey: "idem-webhook-2",
      amountMinor: 1500,
      currency: "PEN",
    });

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/payments/stub-provider",
      headers: { "content-type": "application/json", ...headers },
      payload: rawBody,
    });

    expect(response.statusCode).toBe(200);
    const updated = await orderStore.findById(order.id);
    expect(updated?.status).toBe("PAID");
  });

  it("acceptance: replaying the same valid webhook event twice does not double-transition order state", async () => {
    const { app, accessLinkStore, sessionStore, orderStore, paymentGateway } = await buildTestApp({
      "wifi.checkout": true,
    });
    const rawSessionId = await seedValidSession(accessLinkStore, sessionStore);
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/wifi/orders",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: rawSessionId },
      headers: { "idempotency-key": "idem-webhook-3" },
      payload: { packageId: "WIFI-60" },
    });
    const { order } = createResponse.json() as { order: { id: string } };

    const { rawBody, headers } = paymentGateway.buildWebhookRequest({
      type: "payment_succeeded",
      providerRef: "provider-ref-4",
      orderIdempotencyKey: "idem-webhook-3",
      amountMinor: 1500,
      currency: "PEN",
    });

    const first = await app.inject({
      method: "POST",
      url: "/webhooks/payments/stub-provider",
      headers: { "content-type": "application/json", ...headers },
      payload: rawBody,
    });
    const second = await app.inject({
      method: "POST",
      url: "/webhooks/payments/stub-provider",
      headers: { "content-type": "application/json", ...headers },
      payload: rawBody,
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    const events = await orderStore.listEventsForOrder(order.id);
    expect(events.filter((e) => e.toStatus === "PAID")).toHaveLength(1);
  });

  it("a simulated payment failure transitions to PAYMENT_FAILED with no other side effects wired", async () => {
    const { app, accessLinkStore, sessionStore, orderStore, paymentGateway } = await buildTestApp({
      "wifi.checkout": true,
    });
    const rawSessionId = await seedValidSession(accessLinkStore, sessionStore);
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/wifi/orders",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: rawSessionId },
      headers: { "idempotency-key": "idem-webhook-4" },
      payload: { packageId: "WIFI-60" },
    });
    const { order } = createResponse.json() as { order: { id: string } };

    const { rawBody, headers } = paymentGateway.buildWebhookRequest({
      type: "payment_failed",
      providerRef: "provider-ref-5",
      orderIdempotencyKey: "idem-webhook-4",
      amountMinor: 1500,
      currency: "PEN",
    });

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/payments/stub-provider",
      headers: { "content-type": "application/json", ...headers },
      payload: rawBody,
    });

    expect(response.statusCode).toBe(200);
    const updated = await orderStore.findById(order.id);
    expect(updated?.status).toBe("PAYMENT_FAILED");
    // No entitlement/SIR/receipt fields exist on the DTO; the status endpoint
    // reflects none of those side effects (WU19's scope, not this one's).
    const statusResponse = await app.inject({
      method: "GET",
      url: `/api/wifi/orders/${order.id}`,
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: rawSessionId },
    });
    const dto = statusResponse.json() as { sirRegistered: boolean; receiptIssued: boolean; entitlementRef: unknown };
    expect(dto.sirRegistered).toBe(false);
    expect(dto.receiptIssued).toBe(false);
    expect(dto.entitlementRef).toBeNull();
  });
});
