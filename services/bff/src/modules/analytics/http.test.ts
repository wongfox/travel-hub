import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import { describe, expect, it } from "vitest";
import { registerAnalyticsRoutes } from "./http.js";
import { DEFAULT_SESSION_COOKIE_NAME } from "../trip-access/http.js";
import { createInMemoryAnalyticsEventStore } from "./analytics-event-store.js";
import { createInMemoryAccessLinkStore, type AccessLinkStore } from "../trip-access/access-link-store.js";
import { createInMemorySessionStore, type SessionStore } from "../trip-access/session-store.js";
import { generateAccessToken, hashAccessToken } from "../trip-access/token.js";
import { createInMemoryConsentStore, type ConsentStore } from "../privacy/consent-store.js";

async function buildTestApp(): Promise<{
  app: FastifyInstance;
  accessLinkStore: AccessLinkStore;
  sessionStore: SessionStore;
  consentStore: ConsentStore;
  analyticsEventStore: ReturnType<typeof createInMemoryAnalyticsEventStore>;
}> {
  const app = Fastify();
  await app.register(cookie);
  const accessLinkStore = createInMemoryAccessLinkStore();
  const sessionStore = createInMemorySessionStore();
  const consentStore = createInMemoryConsentStore();
  const analyticsEventStore = createInMemoryAnalyticsEventStore();

  registerAnalyticsRoutes(app, {
    accessLinkStore,
    sessionStore,
    consentStore,
    analyticsEventStore,
    secret: "secret-1",
  });

  return { app, accessLinkStore, sessionStore, consentStore, analyticsEventStore };
}

async function createSession(
  accessLinkStore: AccessLinkStore,
  sessionStore: SessionStore,
  reservationRef = "RES-1001",
): Promise<string> {
  const link = await accessLinkStore.create({
    tokenHash: "hash-1",
    reservationRef,
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
  return sessionId;
}

describe("POST /api/events", () => {
  it("rejects with 401 when there is no valid session", async () => {
    const { app } = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/events",
      payload: { events: [{ name: "screen_view" }] },
    });

    expect(response.statusCode).toBe(401);
  });

  it("rejects with 403 consent_required when analytics consent is not on file, and persists nothing", async () => {
    const { app, accessLinkStore, sessionStore, analyticsEventStore } = await buildTestApp();
    const sessionId = await createSession(accessLinkStore, sessionStore);

    const response = await app.inject({
      method: "POST",
      url: "/api/events",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: sessionId },
      payload: { events: [{ name: "screen_view" }] },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("consent_required");
    expect(await analyticsEventStore.list()).toHaveLength(0);
  });

  it("accepts a JSON-content-typed batch once consent is granted, returning 202", async () => {
    const { app, accessLinkStore, sessionStore, consentStore, analyticsEventStore } = await buildTestApp();
    const sessionId = await createSession(accessLinkStore, sessionStore);
    await consentStore.record({
      linkId: "ignored",
      reservationRef: "RES-1001",
      passengerRef: null,
      purpose: "analytics",
      textVersion: "v1",
      granted: true,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/events",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: sessionId },
      payload: { events: [{ name: "screen_view" }, { name: "screen_view", props: { screen: "wifi" } }] },
    });

    expect(response.statusCode).toBe(202);
    expect(await analyticsEventStore.list()).toHaveLength(2);
  });

  it("rejects a client-submitted server-only funnel event name with 400, recording nothing", async () => {
    const { app, accessLinkStore, sessionStore, consentStore, analyticsEventStore } = await buildTestApp();
    const sessionId = await createSession(accessLinkStore, sessionStore);
    await consentStore.record({
      linkId: "ignored",
      reservationRef: "RES-1001",
      passengerRef: null,
      purpose: "analytics",
      textVersion: "v1",
      granted: true,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/events",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: sessionId },
      payload: { events: [{ name: "wifi_payment_succeeded" }] },
    });

    expect(response.statusCode).toBe(400);
    expect(await analyticsEventStore.list()).toHaveLength(0);
  });

  it("accepts a sendBeacon-style text/plain body (JSON-encoded) once consent is granted", async () => {
    const { app, accessLinkStore, sessionStore, consentStore, analyticsEventStore } = await buildTestApp();
    const sessionId = await createSession(accessLinkStore, sessionStore);
    await consentStore.record({
      linkId: "ignored",
      reservationRef: "RES-1001",
      passengerRef: null,
      purpose: "analytics",
      textVersion: "v1",
      granted: true,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/events",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: sessionId },
      headers: { "content-type": "text/plain" },
      payload: JSON.stringify({ events: [{ name: "screen_view" }] }),
    });

    expect(response.statusCode).toBe(202);
    expect(await analyticsEventStore.list()).toHaveLength(1);
  });

  it("rejects an empty events batch with 400 invalid_request", async () => {
    const { app, accessLinkStore, sessionStore, consentStore } = await buildTestApp();
    const sessionId = await createSession(accessLinkStore, sessionStore);
    await consentStore.record({
      linkId: "ignored",
      reservationRef: "RES-1001",
      passengerRef: null,
      purpose: "analytics",
      textVersion: "v1",
      granted: true,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/events",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: sessionId },
      payload: { events: [] },
    });

    expect(response.statusCode).toBe(400);
  });
});
