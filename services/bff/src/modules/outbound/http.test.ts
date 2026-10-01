import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import { describe, expect, it } from "vitest";
import { registerOutboundRoutes } from "./http.js";
import type { TfeRedirectConfig } from "./resolve-tfe-redirect.js";
import { DEFAULT_SESSION_COOKIE_NAME } from "../trip-access/http.js";
import { createInMemoryAccessLinkStore } from "../trip-access/access-link-store.js";
import { createInMemorySessionStore } from "../trip-access/session-store.js";
import { generateAccessToken, hashAccessToken } from "../trip-access/token.js";

const CONFIG: TfeRedirectConfig = {
  baseUrl: "https://www.trainexperience.example",
  allowedPlacements: { home_banner: "/offers/machu-picchu-sunset" },
  attributionParams: { utm_source: "travel-hub-app" },
};

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify();
  registerOutboundRoutes(app, { tfeConfig: CONFIG });
  return app;
}

describe("GET /api/out/tfe", () => {
  it("redirects 302 to the configured TFE URL with attribution params for an allowlisted placement", async () => {
    const app = await buildTestApp();

    const response = await app.inject({ method: "GET", url: "/api/out/tfe?placement=home_banner" });

    expect(response.statusCode).toBe(302);
    const location = response.headers.location as string;
    expect(location).toMatch(/^https:\/\/www\.trainexperience\.example\/offers\/machu-picchu-sunset\?/);
    expect(location).toContain("utm_source=travel-hub-app");
    expect(location).toContain("placement=home_banner");
  });

  it("rejects an unknown/arbitrary placement with 400, never redirecting anywhere (task 10.5's open-redirect-safety acceptance)", async () => {
    const app = await buildTestApp();

    const response = await app.inject({ method: "GET", url: "/api/out/tfe?placement=arbitrary-attacker-value" });

    expect(response.statusCode).toBe(400);
    expect(response.headers.location).toBeUndefined();
    expect(response.json()).toMatchObject({ code: "invalid_request" });
  });

  it("rejects a placement value that looks like a URL, never redirecting to it (open-redirect-safety)", async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: `/api/out/tfe?placement=${encodeURIComponent("https://evil.example")}`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers.location).toBeUndefined();
  });

  it("rejects a missing placement query param with 400", async () => {
    const app = await buildTestApp();

    const response = await app.inject({ method: "GET", url: "/api/out/tfe" });

    expect(response.statusCode).toBe(400);
  });

  it("records a tfe_click_out analytics event attributed to the session's reservation when a valid session is present (task 12.2)", async () => {
    const app = Fastify();
    await app.register(cookie);
    const accessLinkStore = createInMemoryAccessLinkStore();
    const sessionStore = createInMemorySessionStore();
    const link = await accessLinkStore.create({
      tokenHash: "hash-1",
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
    const calls: { reservationRef: string; name: string }[] = [];
    registerOutboundRoutes(app, {
      tfeConfig: CONFIG,
      accessLinkStore,
      sessionStore,
      analytics: {
        async record(input) {
          calls.push({ reservationRef: input.reservationRef, name: input.name });
        },
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/out/tfe?placement=home_banner",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: sessionId },
    });

    expect(response.statusCode).toBe(302);
    expect(calls).toEqual([{ reservationRef: "RES-1001", name: "tfe_click_out" }]);
  });

  it("still redirects successfully with no analytics event when there is no valid session (redirect never depends on session)", async () => {
    const app = Fastify();
    await app.register(cookie);
    registerOutboundRoutes(app, {
      tfeConfig: CONFIG,
      accessLinkStore: createInMemoryAccessLinkStore(),
      sessionStore: createInMemorySessionStore(),
    });

    const response = await app.inject({ method: "GET", url: "/api/out/tfe?placement=home_banner" });

    expect(response.statusCode).toBe(302);
  });
});
