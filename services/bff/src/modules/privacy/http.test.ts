import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import { describe, expect, it } from "vitest";
import { registerPrivacyRoutes } from "./http.js";
import { createInMemoryConsentStore, type ConsentStore } from "./consent-store.js";
import {
  createInMemoryAccessLinkStore,
  type AccessLinkStore,
} from "../trip-access/access-link-store.js";
import { createInMemorySessionStore, type SessionStore } from "../trip-access/session-store.js";
import { DEFAULT_SESSION_COOKIE_NAME } from "../trip-access/http.js";
import { generateAccessToken, hashAccessToken } from "../trip-access/token.js";

async function buildTestApp(): Promise<{
  app: FastifyInstance;
  accessLinkStore: AccessLinkStore;
  sessionStore: SessionStore;
  consentStore: ConsentStore;
}> {
  const app = Fastify();
  await app.register(cookie);
  const accessLinkStore = createInMemoryAccessLinkStore();
  const sessionStore = createInMemorySessionStore();
  const consentStore = createInMemoryConsentStore();

  registerPrivacyRoutes(app, { accessLinkStore, sessionStore, consentStore });
  await app.ready();

  return { app, accessLinkStore, sessionStore, consentStore };
}

async function seedSessionCookie(
  accessLinkStore: AccessLinkStore,
  sessionStore: SessionStore,
  reservationRef = "RES-1001",
): Promise<string> {
  const token = generateAccessToken();
  const link = await accessLinkStore.create({
    tokenHash: hashAccessToken(token),
    reservationRef,
    passengerScope: [],
    expiresAt: "2027-01-01T00:00:00.000Z",
    issueChannel: "email",
  });
  const sessionId = generateAccessToken();
  await sessionStore.create(hashAccessToken(sessionId), {
    linkId: link.id,
    expiresAt: "2027-01-01T00:00:00.000Z",
    locale: "es",
  });
  return sessionId;
}

describe("POST /api/consents", () => {
  it("rejects a request with no session cookie", async () => {
    const { app } = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/consents",
      payload: { purpose: "precheckin_biometric", textVersion: "v1", granted: true },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ code: "link_expired", requestId: expect.any(String) });
  });

  it("rejects a malformed body", async () => {
    const { app, accessLinkStore, sessionStore } = await buildTestApp();
    const sessionId = await seedSessionCookie(accessLinkStore, sessionStore);

    const response = await app.inject({
      method: "POST",
      url: "/api/consents",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: sessionId },
      payload: { purpose: "not-a-real-purpose", textVersion: "v1", granted: true },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ code: "invalid_request", requestId: expect.any(String) });
  });

  it("records a granted consent for the session's reservation and returns the resulting state", async () => {
    const { app, accessLinkStore, sessionStore, consentStore } = await buildTestApp();
    const sessionId = await seedSessionCookie(accessLinkStore, sessionStore, "RES-2002");

    const response = await app.inject({
      method: "POST",
      url: "/api/consents",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: sessionId },
      payload: { purpose: "precheckin_biometric", textVersion: "v3", granted: true },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      purpose: "precheckin_biometric",
      granted: true,
      textVersion: "v3",
      recordedAt: expect.any(String),
    });

    const latest = await consentStore.findLatest("RES-2002", null, "precheckin_biometric");
    expect(latest?.granted).toBe(true);
  });

  it("records a withdrawal (granted: false) just as successfully", async () => {
    const { app, accessLinkStore, sessionStore } = await buildTestApp();
    const sessionId = await seedSessionCookie(accessLinkStore, sessionStore);

    const response = await app.inject({
      method: "POST",
      url: "/api/consents",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: sessionId },
      payload: { purpose: "pulse", textVersion: "v1", granted: false },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ granted: false });
  });
});
