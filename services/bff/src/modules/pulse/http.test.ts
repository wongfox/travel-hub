import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { describe, expect, it } from "vitest";
import { registerPulseRoutes } from "./http.js";
import { DEFAULT_SESSION_COOKIE_NAME } from "../trip-access/http.js";
import { createInMemoryAccessLinkStore, type AccessLinkStore } from "../trip-access/access-link-store.js";
import { createInMemorySessionStore, type SessionStore } from "../trip-access/session-store.js";
import { hashAccessToken, generateAccessToken } from "../trip-access/token.js";
import { createInMemoryConsentStore, type ConsentStore } from "../privacy/consent-store.js";
import { createInMemoryPulseResponseStore } from "./pulse-response-store.js";
import { createInMemoryStaffAlertStore } from "./staff-alert-store.js";
import { createInMemoryPulsePromptDeliveryStore } from "./pulse-prompt-delivery-store.js";
import { createInMemoryPushSubscriptionStore } from "../notifications/push-subscription-store.js";
import { createWebPushStub } from "../../adapters/web-push/stub.js";
import { FLAG_DEFAULTS } from "../../config/flags.js";
import type { SirBookingPort, SirReservation } from "../booking/ports.js";

const RESERVATION: SirReservation = {
  reservationRef: "RES-1001",
  passengers: [{ passengerRef: "P1", ordinal: 1, displayName: "Ana Torres" }],
  legs: [
    {
      legRef: "L1",
      origin: "Ollantaytambo",
      destination: "Machu Picchu Pueblo",
      departureLocal: "2026-11-02T08:10:00-05:00",
      arrivalLocal: "2026-11-02T09:40:00-05:00",
      tier: "PRIME",
      status: "SCHEDULED",
      seat: "5A",
      coach: "3",
      barcodeFormat: "CODE128",
      barcodePayload: "BP-1",
    },
  ],
  contact: { kind: "email", address: "ana@example.com" },
  tickets: [],
};

function createFakeSirBooking(reservation: SirReservation = RESERVATION): Pick<SirBookingPort, "getReservation"> {
  return { async getReservation() { return reservation; } };
}

async function buildSession(
  accessLinkStore: AccessLinkStore,
  sessionStore: SessionStore,
): Promise<{ cookieValue: string; accessLinkId: string }> {
  const link = await accessLinkStore.create({
    tokenHash: hashAccessToken(generateAccessToken()),
    reservationRef: "RES-1001",
    passengerScope: [],
    expiresAt: "2099-01-01T00:00:00.000Z",
    issueChannel: "email",
  });
  const sessionId = generateAccessToken();
  await sessionStore.create(hashAccessToken(sessionId), {
    linkId: link.id,
    expiresAt: "2099-01-01T00:00:00.000Z",
    locale: "es",
  });
  return { cookieValue: sessionId, accessLinkId: link.id };
}

async function buildTestApp(options: {
  flags?: Record<string, boolean>;
  consentStore?: ConsentStore;
  sirBooking?: Pick<SirBookingPort, "getReservation">;
  negativePulseRule?: { scoreThreshold: number; onlyWhenReturnLegPending?: boolean };
}) {
  const app = Fastify();
  await app.register(cookie);
  const accessLinkStore = createInMemoryAccessLinkStore();
  const sessionStore = createInMemorySessionStore();
  const consentStore = options.consentStore ?? createInMemoryConsentStore();
  const pulseResponseStore = createInMemoryPulseResponseStore();
  const staffAlertStore = createInMemoryStaffAlertStore();
  const pulsePromptDeliveryStore = createInMemoryPulsePromptDeliveryStore();
  const subscriptionStore = createInMemoryPushSubscriptionStore();
  const webPush = createWebPushStub();

  registerPulseRoutes(app, {
    accessLinkStore,
    sessionStore,
    consentStore,
    sirBooking: options.sirBooking ?? createFakeSirBooking(),
    pulseResponseStore,
    staffAlertStore,
    pulsePromptDeliveryStore,
    subscriptionStore,
    webPush,
    negativePulseRule: options.negativePulseRule ?? { scoreThreshold: 2 },
    flags: { ...FLAG_DEFAULTS, ...options.flags },
  });
  await app.ready();

  return {
    app,
    accessLinkStore,
    sessionStore,
    consentStore,
    pulseResponseStore,
    staffAlertStore,
    subscriptionStore,
    webPush,
  };
}

async function grantPulseConsent(consentStore: ConsentStore, linkId: string): Promise<void> {
  await consentStore.record({
    linkId,
    reservationRef: "RES-1001",
    passengerRef: null,
    purpose: "pulse",
    textVersion: "v1",
    granted: true,
  });
}

describe("POST /api/pulse", () => {
  it("returns 403 feature_disabled when pulse.capture is off", async () => {
    const { app, accessLinkStore, sessionStore } = await buildTestApp({ flags: { "pulse.capture": false } });
    const { cookieValue } = await buildSession(accessLinkStore, sessionStore);

    const response = await app.inject({
      method: "POST",
      url: "/api/pulse",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: cookieValue },
      payload: { legId: "L1", score: 4 },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "feature_disabled" });
  });

  it("returns 401 link_expired without a valid session", async () => {
    const { app } = await buildTestApp({ flags: { "pulse.capture": true } });

    const response = await app.inject({
      method: "POST",
      url: "/api/pulse",
      payload: { legId: "L1", score: 4 },
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns 403 consent_required when no pulse consent is recorded", async () => {
    const { app, accessLinkStore, sessionStore, pulseResponseStore } = await buildTestApp({
      flags: { "pulse.capture": true },
    });
    const { cookieValue } = await buildSession(accessLinkStore, sessionStore);

    const response = await app.inject({
      method: "POST",
      url: "/api/pulse",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: cookieValue },
      payload: { legId: "L1", score: 4 },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "consent_required" });
    expect(await pulseResponseStore.list()).toEqual([]);
  });

  it("rejects a malformed body with 400", async () => {
    const { app, accessLinkStore, sessionStore, consentStore } = await buildTestApp({
      flags: { "pulse.capture": true },
    });
    const { cookieValue, accessLinkId } = await buildSession(accessLinkStore, sessionStore);
    await grantPulseConsent(consentStore, accessLinkId);

    const response = await app.inject({
      method: "POST",
      url: "/api/pulse",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: cookieValue },
      payload: { legId: "L1", score: 99 },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 201 and captures the response for a valid, non-negative submission", async () => {
    const { app, accessLinkStore, sessionStore, consentStore, pulseResponseStore } = await buildTestApp({
      flags: { "pulse.capture": true },
    });
    const { cookieValue, accessLinkId } = await buildSession(accessLinkStore, sessionStore);
    await grantPulseConsent(consentStore, accessLinkId);

    const response = await app.inject({
      method: "POST",
      url: "/api/pulse",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: cookieValue },
      payload: { legId: "L1", score: 5 },
    });

    expect(response.statusCode).toBe(201);
    expect(await pulseResponseStore.list()).toHaveLength(1);
  });

  it("returns 409 already_submitted on a second submission for the same passenger/leg, without a second recorded response", async () => {
    const { app, accessLinkStore, sessionStore, consentStore, pulseResponseStore } = await buildTestApp({
      flags: { "pulse.capture": true },
    });
    const { cookieValue, accessLinkId } = await buildSession(accessLinkStore, sessionStore);
    await grantPulseConsent(consentStore, accessLinkId);
    await app.inject({
      method: "POST",
      url: "/api/pulse",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: cookieValue },
      payload: { legId: "L1", score: 5 },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/pulse",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: cookieValue },
      payload: { legId: "L1", score: 1 },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "already_submitted" });
    expect(await pulseResponseStore.list()).toHaveLength(1);
  });

  it("creates exactly one staff_alert with status=pending (dispatch not yet attempted) for a negative response when pulse.staff_alerts is on, and still returns 201 — the passenger response never waits on StaffAlertPort (D4a, task 11.5)", async () => {
    const { app, accessLinkStore, sessionStore, consentStore, staffAlertStore } = await buildTestApp({
      flags: { "pulse.capture": true, "pulse.staff_alerts": true },
    });
    const { cookieValue, accessLinkId } = await buildSession(accessLinkStore, sessionStore);
    await grantPulseConsent(consentStore, accessLinkId);

    const response = await app.inject({
      method: "POST",
      url: "/api/pulse",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: cookieValue },
      payload: { legId: "L1", score: 1 },
    });

    expect(response.statusCode).toBe(201);
    const alerts = await staffAlertStore.listPending();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.status).toBe("pending");
    expect(Object.keys(alerts[0]!.payload)).not.toContain("passengerName");
  });

  it("does NOT create a staff_alert for a negative response when pulse.staff_alerts is off, while still capturing the response (task 11.5 acceptance)", async () => {
    const { app, accessLinkStore, sessionStore, consentStore, pulseResponseStore, staffAlertStore } =
      await buildTestApp({ flags: { "pulse.capture": true, "pulse.staff_alerts": false } });
    const { cookieValue, accessLinkId } = await buildSession(accessLinkStore, sessionStore);
    await grantPulseConsent(consentStore, accessLinkId);

    const response = await app.inject({
      method: "POST",
      url: "/api/pulse",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: cookieValue },
      payload: { legId: "L1", score: 1 },
    });

    expect(response.statusCode).toBe(201);
    expect(await pulseResponseStore.list()).toHaveLength(1);
    expect(await staffAlertStore.listPending()).toEqual([]);
  });
});

describe("POST /api/pulse/prompt", () => {
  it("returns 403 feature_disabled when pulse.capture is off", async () => {
    const { app, accessLinkStore, sessionStore } = await buildTestApp({ flags: { "pulse.capture": false } });
    const { cookieValue } = await buildSession(accessLinkStore, sessionStore);

    const response = await app.inject({
      method: "POST",
      url: "/api/pulse/prompt",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: cookieValue },
      payload: { legId: "L1" },
    });

    expect(response.statusCode).toBe(403);
  });

  it("returns 401 without a valid session", async () => {
    const { app } = await buildTestApp({ flags: { "pulse.capture": true } });

    const response = await app.inject({
      method: "POST",
      url: "/api/pulse/prompt",
      payload: { legId: "L1" },
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns 202 and delivers push to every active subscription on the reservation", async () => {
    const { app, accessLinkStore, sessionStore, consentStore, subscriptionStore, webPush } = await buildTestApp({
      flags: { "pulse.capture": true },
    });
    const { cookieValue, accessLinkId } = await buildSession(accessLinkStore, sessionStore);
    await grantPulseConsent(consentStore, accessLinkId);
    await subscriptionStore.create({
      linkId: accessLinkId,
      reservationRef: "RES-1001",
      passengerScope: [],
      endpoint: "https://push.example.com/endpoint-1",
      p256dh: "p256dh-1",
      auth: "auth-1",
      locale: "es",
      consentRecordId: "consent-1",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/pulse/prompt",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: cookieValue },
      payload: { legId: "L1" },
    });

    expect(response.statusCode).toBe(202);
    expect(webPush.sentPayloads).toHaveLength(1);
    expect(webPush.sentPayloads[0]?.payload.type).toBe("PULSE_PROMPT");
  });

  it("is idempotent per (reservation, leg): a second request for the same moment does not send a second push", async () => {
    const { app, accessLinkStore, sessionStore, consentStore, subscriptionStore, webPush } = await buildTestApp({
      flags: { "pulse.capture": true },
    });
    const { cookieValue, accessLinkId } = await buildSession(accessLinkStore, sessionStore);
    await grantPulseConsent(consentStore, accessLinkId);
    await subscriptionStore.create({
      linkId: accessLinkId,
      reservationRef: "RES-1001",
      passengerScope: [],
      endpoint: "https://push.example.com/endpoint-1",
      p256dh: "p256dh-1",
      auth: "auth-1",
      locale: "es",
      consentRecordId: "consent-1",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    await app.inject({
      method: "POST",
      url: "/api/pulse/prompt",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: cookieValue },
      payload: { legId: "L1" },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/pulse/prompt",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: cookieValue },
      payload: { legId: "L1" },
    });

    expect(response.statusCode).toBe(202);
    expect(webPush.sentPayloads).toHaveLength(1);
  });

  it("stops future prompts once pulse consent is withdrawn (task 12.3): returns 202 but delivers nothing, in-app or push", async () => {
    const { app, accessLinkStore, sessionStore, consentStore, subscriptionStore, webPush } = await buildTestApp({
      flags: { "pulse.capture": true },
    });
    const { cookieValue, accessLinkId } = await buildSession(accessLinkStore, sessionStore);
    await grantPulseConsent(consentStore, accessLinkId);
    await subscriptionStore.create({
      linkId: accessLinkId,
      reservationRef: "RES-1001",
      passengerScope: [],
      endpoint: "https://push.example.com/endpoint-1",
      p256dh: "p256dh-1",
      auth: "auth-1",
      locale: "es",
      consentRecordId: "consent-1",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    // Withdrawal: a new `granted: false` record for the same purpose,
    // same append-only convention as every other consent withdrawal.
    await consentStore.record({
      linkId: accessLinkId,
      reservationRef: "RES-1001",
      passengerRef: null,
      purpose: "pulse",
      textVersion: "v1",
      granted: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/pulse/prompt",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: cookieValue },
      payload: { legId: "L1" },
    });

    expect(response.statusCode).toBe(202);
    expect(webPush.sentPayloads).toHaveLength(0);
  });

  it("never requests a prompt at all when pulse consent was never granted", async () => {
    const { app, accessLinkStore, sessionStore, webPush } = await buildTestApp({
      flags: { "pulse.capture": true },
    });
    const { cookieValue } = await buildSession(accessLinkStore, sessionStore);

    const response = await app.inject({
      method: "POST",
      url: "/api/pulse/prompt",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: cookieValue },
      payload: { legId: "L1" },
    });

    expect(response.statusCode).toBe(202);
    expect(webPush.sentPayloads).toHaveLength(0);
  });
});
