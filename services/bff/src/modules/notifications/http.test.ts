import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import { describe, expect, it } from "vitest";
import { registerNotificationRoutes } from "./http.js";
import { DEFAULT_SESSION_COOKIE_NAME } from "../trip-access/http.js";
import { createInMemoryAccessLinkStore, type AccessLinkStore } from "../trip-access/access-link-store.js";
import { createInMemorySessionStore, type SessionStore } from "../trip-access/session-store.js";
import { hashAccessToken, generateAccessToken } from "../trip-access/token.js";
import { createInMemoryConsentStore, type ConsentStore } from "../privacy/consent-store.js";
import { createInMemoryPushSubscriptionStore } from "./push-subscription-store.js";
import { FLAG_DEFAULTS } from "../../config/flags.js";

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
  pushSubscriptionStore?: ReturnType<typeof createInMemoryPushSubscriptionStore>;
}): Promise<{
  app: FastifyInstance;
  accessLinkStore: AccessLinkStore;
  sessionStore: SessionStore;
  consentStore: ConsentStore;
  pushSubscriptionStore: ReturnType<typeof createInMemoryPushSubscriptionStore>;
}> {
  const app = Fastify();
  await app.register(cookie);
  const accessLinkStore = createInMemoryAccessLinkStore();
  const sessionStore = createInMemorySessionStore();
  const consentStore = options.consentStore ?? createInMemoryConsentStore();
  const pushSubscriptionStore = options.pushSubscriptionStore ?? createInMemoryPushSubscriptionStore();

  registerNotificationRoutes(app, {
    accessLinkStore,
    sessionStore,
    consentStore,
    subscriptionStore: pushSubscriptionStore,
    flags: { ...FLAG_DEFAULTS, ...options.flags },
  });
  await app.ready();

  return { app, accessLinkStore, sessionStore, consentStore, pushSubscriptionStore };
}

const SUBSCRIPTION_BODY = {
  endpoint: "https://push.example.com/endpoint-1",
  keys: { p256dh: "p256dh-1", auth: "auth-1" },
  locale: "es",
};

describe("POST /api/push/subscriptions", () => {
  it("returns 403 feature_disabled when push.enabled is off", async () => {
    const { app, accessLinkStore, sessionStore } = await buildTestApp({ flags: { "push.enabled": false } });
    const { cookieValue } = await buildSession(accessLinkStore, sessionStore);

    const response = await app.inject({
      method: "POST",
      url: "/api/push/subscriptions",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: cookieValue },
      payload: SUBSCRIPTION_BODY,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "feature_disabled" });
  });

  it("returns 401 link_expired without a valid session", async () => {
    const { app } = await buildTestApp({ flags: { "push.enabled": true } });

    const response = await app.inject({
      method: "POST",
      url: "/api/push/subscriptions",
      payload: SUBSCRIPTION_BODY,
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns 403 consent_required when no push consent is recorded (task 11.1 acceptance)", async () => {
    const { app, accessLinkStore, sessionStore, pushSubscriptionStore } = await buildTestApp({
      flags: { "push.enabled": true },
    });
    const { cookieValue } = await buildSession(accessLinkStore, sessionStore);

    const response = await app.inject({
      method: "POST",
      url: "/api/push/subscriptions",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: cookieValue },
      payload: SUBSCRIPTION_BODY,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "consent_required" });
    expect(await pushSubscriptionStore.findActiveByReservation("RES-1001")).toEqual([]);
  });

  it("creates a subscription scoped to the link when push consent is recorded", async () => {
    const { app, accessLinkStore, sessionStore, consentStore, pushSubscriptionStore } = await buildTestApp({
      flags: { "push.enabled": true },
    });
    const { cookieValue, accessLinkId } = await buildSession(accessLinkStore, sessionStore);
    await consentStore.record({
      linkId: accessLinkId,
      reservationRef: "RES-1001",
      passengerRef: null,
      purpose: "push",
      textVersion: "v1",
      granted: true,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/push/subscriptions",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: cookieValue },
      payload: SUBSCRIPTION_BODY,
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as { id: string; expiresAt: string };
    const stored = await pushSubscriptionStore.findById(body.id);
    expect(stored?.linkId).toBe(accessLinkId);
    expect(stored?.reservationRef).toBe("RES-1001");
  });

  it("rejects a malformed request body with 400", async () => {
    const { app, accessLinkStore, sessionStore, consentStore } = await buildTestApp({
      flags: { "push.enabled": true },
    });
    const { cookieValue, accessLinkId } = await buildSession(accessLinkStore, sessionStore);
    await consentStore.record({
      linkId: accessLinkId,
      reservationRef: "RES-1001",
      passengerRef: null,
      purpose: "push",
      textVersion: "v1",
      granted: true,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/push/subscriptions",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: cookieValue },
      payload: { endpoint: "not-a-valid-url" },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("DELETE /api/push/subscriptions/:id", () => {
  it("returns 403 feature_disabled when push.enabled is off", async () => {
    const { app, accessLinkStore, sessionStore } = await buildTestApp({ flags: { "push.enabled": false } });
    const { cookieValue } = await buildSession(accessLinkStore, sessionStore);

    const response = await app.inject({
      method: "DELETE",
      url: "/api/push/subscriptions/does-not-matter",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: cookieValue },
    });

    expect(response.statusCode).toBe(403);
  });

  it("deletes a subscription owned by the current session's link, returning 204", async () => {
    const { app, accessLinkStore, sessionStore, pushSubscriptionStore } = await buildTestApp({
      flags: { "push.enabled": true },
    });
    const { cookieValue, accessLinkId } = await buildSession(accessLinkStore, sessionStore);
    const subscription = await pushSubscriptionStore.create({
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
      method: "DELETE",
      url: `/api/push/subscriptions/${subscription.id}`,
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: cookieValue },
    });

    expect(response.statusCode).toBe(204);
    expect(await pushSubscriptionStore.findById(subscription.id)).toBeNull();
  });

  it("returns 404 and does not delete a subscription owned by a different link", async () => {
    const { app, accessLinkStore, sessionStore, pushSubscriptionStore } = await buildTestApp({
      flags: { "push.enabled": true },
    });
    const { cookieValue } = await buildSession(accessLinkStore, sessionStore);
    const subscription = await pushSubscriptionStore.create({
      linkId: "some-other-link-id",
      reservationRef: "RES-2002",
      passengerScope: [],
      endpoint: "https://push.example.com/endpoint-2",
      p256dh: "p256dh-2",
      auth: "auth-2",
      locale: "es",
      consentRecordId: "consent-2",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });

    const response = await app.inject({
      method: "DELETE",
      url: `/api/push/subscriptions/${subscription.id}`,
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: cookieValue },
    });

    expect(response.statusCode).toBe(404);
    expect(await pushSubscriptionStore.findById(subscription.id)).toEqual(subscription);
  });

  it("returns 404 for an unknown subscription id", async () => {
    const { app, accessLinkStore, sessionStore } = await buildTestApp({ flags: { "push.enabled": true } });
    const { cookieValue } = await buildSession(accessLinkStore, sessionStore);

    const response = await app.inject({
      method: "DELETE",
      url: "/api/push/subscriptions/does-not-exist",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: cookieValue },
    });

    expect(response.statusCode).toBe(404);
  });
});
