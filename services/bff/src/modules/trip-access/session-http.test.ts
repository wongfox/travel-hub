import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import { describe, expect, it } from "vitest";
import { registerTripAccessRoutes, DEFAULT_SESSION_COOKIE_NAME } from "./http.js";
import { createInMemoryAccessLinkStore, type AccessLinkStore } from "./access-link-store.js";
import { createInMemorySessionStore, type SessionStore } from "./session-store.js";
import { createInMemoryRateLimiter } from "./rate-limiter.js";
import { createLinkDeliveryStub } from "../../adapters/link-delivery/stub.js";
import { generateAccessToken, hashAccessToken } from "./token.js";
import type { ContactChannel } from "./ports.js";
import type { SirBookingPort } from "../booking/ports.js";

const NEVER_LIMITED = () => createInMemoryRateLimiter({ max: 1_000_000, windowMs: 60_000 });

async function buildTestApp(options?: { sessionRateLimiterMax?: number; now?: () => Date }): Promise<{
  app: FastifyInstance;
  store: AccessLinkStore;
  sessionStore: SessionStore;
}> {
  const app = Fastify();
  await app.register(cookie);
  const store = createInMemoryAccessLinkStore();
  const sessionStore = createInMemorySessionStore();
  const noOpSirBooking: Pick<SirBookingPort, "getContactForLinkDelivery"> = {
    async getContactForLinkDelivery(): Promise<ContactChannel | null> {
      return null;
    },
  };

  registerTripAccessRoutes(app, {
    store,
    sessionStore,
    sirBooking: noOpSirBooking,
    linkDelivery: createLinkDeliveryStub(),
    internalApiKey: "test-internal-key",
    linkExpiryMs: 72 * 60 * 60 * 1000,
    sessionSlidingMs: 7 * 24 * 60 * 60 * 1000,
    buildLinkUrl: (token: string) => `https://app.travel-hub.local/t#${token}`,
    sessionRateLimiter: options?.sessionRateLimiterMax
      ? createInMemoryRateLimiter({ max: options.sessionRateLimiterMax, windowMs: 60_000 })
      : NEVER_LIMITED(),
    reissueRateLimiter: NEVER_LIMITED(),
    ...(options?.now ? { now: options.now } : {}),
  });
  await app.ready();

  return { app, store, sessionStore };
}

async function seedActiveLink(store: AccessLinkStore, expiresAt: string): Promise<string> {
  const token = generateAccessToken();
  await store.create({
    tokenHash: hashAccessToken(token),
    reservationRef: "RES-1001",
    passengerScope: [],
    expiresAt,
    issueChannel: "email",
  });
  return token;
}

function extractCookie(setCookieHeader: string | string[] | undefined): string | undefined {
  const header = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  return header?.split(";")[0]?.split("=")[1];
}

describe("POST /api/session", () => {
  it("exchanges a valid, unexpired token for a session cookie", async () => {
    const { app, store } = await buildTestApp();
    const token = await seedActiveLink(store, "2027-01-01T00:00:00.000Z");

    const response = await app.inject({ method: "POST", url: "/api/session", payload: { token } });

    expect(response.statusCode).toBe(200);
    const setCookie = response.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    const header = Array.isArray(setCookie) ? setCookie[0]! : (setCookie as string);
    expect(header).toContain(`${DEFAULT_SESSION_COOKIE_NAME}=`);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
    expect(header.toLowerCase()).toContain("samesite=lax");
    const cookieValue = extractCookie(setCookie);
    expect(cookieValue).not.toBe(token);
  });

  it("rejects an unknown/malformed token with 401 link_expired and no cookie", async () => {
    const { app } = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/session",
      payload: { token: "never-issued-token" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "link_expired" });
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("rejects an expired token with 401 link_expired", async () => {
    const now = new Date("2026-06-01T00:00:00.000Z");
    const { app, store } = await buildTestApp({ now: () => now });
    const token = await seedActiveLink(store, "2026-05-01T00:00:00.000Z");

    const response = await app.inject({ method: "POST", url: "/api/session", payload: { token } });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "link_expired" });
  });

  it("rejects a revoked token with 401 link_revoked", async () => {
    const { app, store } = await buildTestApp();
    const token = await seedActiveLink(store, "2027-01-01T00:00:00.000Z");
    const record = await store.findByTokenHash(hashAccessToken(token));
    await store.revoke(record!.id, "some-newer-link");

    const response = await app.inject({ method: "POST", url: "/api/session", payload: { token } });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "link_revoked" });
  });

  it("rejects a malformed request body with 400", async () => {
    const { app } = await buildTestApp();

    const response = await app.inject({ method: "POST", url: "/api/session", payload: {} });

    expect(response.statusCode).toBe(400);
  });

  it("throttles repeated attempts beyond the configured rate limit", async () => {
    const { app } = await buildTestApp({ sessionRateLimiterMax: 2 });

    await app.inject({ method: "POST", url: "/api/session", payload: { token: "x" } });
    await app.inject({ method: "POST", url: "/api/session", payload: { token: "x" } });
    const third = await app.inject({ method: "POST", url: "/api/session", payload: { token: "x" } });

    expect(third.statusCode).toBe(429);
  });
});

describe("GET /api/session", () => {
  it("returns the bootstrap payload for a valid session cookie", async () => {
    const { app, store } = await buildTestApp();
    const token = await seedActiveLink(store, "2027-01-01T00:00:00.000Z");
    const exchange = await app.inject({ method: "POST", url: "/api/session", payload: { token, locale: "en" } });
    const cookieValue = extractCookie(exchange.headers["set-cookie"]);

    const response = await app.inject({
      method: "GET",
      url: "/api/session",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: cookieValue! },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ locale: "en" });
  });

  it("returns 401 link_expired when no session cookie is present", async () => {
    const { app } = await buildTestApp();

    const response = await app.inject({ method: "GET", url: "/api/session" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "link_expired" });
  });

  it("returns 401 link_expired for an unknown session cookie value", async () => {
    const { app } = await buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/session",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: "not-a-real-session-id" },
    });

    expect(response.statusCode).toBe(401);
  });
});

describe("DELETE /api/session", () => {
  it("clears the session so a subsequent GET is unauthorized", async () => {
    const { app, store } = await buildTestApp();
    const token = await seedActiveLink(store, "2027-01-01T00:00:00.000Z");
    const exchange = await app.inject({ method: "POST", url: "/api/session", payload: { token } });
    const cookieValue = extractCookie(exchange.headers["set-cookie"]);

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: "/api/session",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: cookieValue! },
    });
    expect(deleteResponse.statusCode).toBe(204);

    const getResponse = await app.inject({
      method: "GET",
      url: "/api/session",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: cookieValue! },
    });
    expect(getResponse.statusCode).toBe(401);
  });

  it("is a harmless no-op when no session cookie is present", async () => {
    const { app } = await buildTestApp();

    const response = await app.inject({ method: "DELETE", url: "/api/session" });

    expect(response.statusCode).toBe(204);
  });
});
