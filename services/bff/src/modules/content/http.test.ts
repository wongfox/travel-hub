import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import { describe, expect, it } from "vitest";
import { registerContentRoutes } from "./http.js";
import { createContentStub } from "../../adapters/content/stub.js";
import { DEFAULT_SESSION_COOKIE_NAME } from "../trip-access/http.js";
import { createInMemoryAccessLinkStore, type AccessLinkStore } from "../trip-access/access-link-store.js";
import { createInMemorySessionStore, type SessionStore } from "../trip-access/session-store.js";
import { generateAccessToken, hashAccessToken } from "../trip-access/token.js";
import { FLAG_DEFAULTS, type FlagKey } from "../../config/flags.js";
import type { SirBookingPort, SirReservation } from "../booking/ports.js";

const reservation: SirReservation = {
  reservationRef: "RES-1001",
  contact: { kind: "email", address: "ana@example.com" },
  passengers: [],
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
      barcodePayload: "BP-L1",
    },
  ],
  tickets: [],
};

function fakeSirBooking(): Pick<SirBookingPort, "getReservation"> {
  return {
    async getReservation() {
      return reservation;
    },
  };
}

async function buildTestApp(
  flags: Partial<Record<FlagKey, boolean>> = {},
): Promise<{ app: FastifyInstance; accessLinkStore: AccessLinkStore; sessionStore: SessionStore }> {
  const app = Fastify();
  await app.register(cookie);
  const accessLinkStore = createInMemoryAccessLinkStore();
  const sessionStore = createInMemorySessionStore();
  registerContentRoutes(app, {
    accessLinkStore,
    sessionStore,
    sirBooking: fakeSirBooking(),
    content: createContentStub(),
    flags: { ...FLAG_DEFAULTS, ...flags },
  });
  await app.ready();
  return { app, accessLinkStore, sessionStore };
}

async function seedValidSession(
  accessLinkStore: AccessLinkStore,
  sessionStore: SessionStore,
  locale: "es" | "en" | "pt" = "es",
): Promise<string> {
  const link = await accessLinkStore.create({
    tokenHash: hashAccessToken(generateAccessToken()),
    reservationRef: "RES-1001",
    passengerScope: [],
    expiresAt: "2027-01-01T00:00:00.000Z",
    issueChannel: "email",
  });
  const rawSessionId = generateAccessToken();
  await sessionStore.create(hashAccessToken(rawSessionId), {
    linkId: link.id,
    expiresAt: "2027-01-01T00:00:00.000Z",
    locale,
  });
  return rawSessionId;
}

describe("GET /api/content/faq", () => {
  it("returns 401 link_expired when no session cookie is present", async () => {
    const { app } = await buildTestApp();

    const response = await app.inject({ method: "GET", url: "/api/content/faq" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "link_expired" });
  });

  it("returns FAQ content in the session's locale, with an ETag header", async () => {
    const { app, accessLinkStore, sessionStore } = await buildTestApp();
    const rawSessionId = await seedValidSession(accessLinkStore, sessionStore, "en");

    const response = await app.inject({
      method: "GET",
      url: "/api/content/faq",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: rawSessionId },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { locale: string; data: unknown[] };
    expect(body.locale).toBe("en");
    expect(body.data.length).toBeGreaterThan(0);
    expect(response.headers.etag).toEqual(expect.any(String));
  });

  it("acceptance: falls back to es content (not empty) for a Portuguese session, flagging fallbackLocale", async () => {
    const { app, accessLinkStore, sessionStore } = await buildTestApp();
    const rawSessionId = await seedValidSession(accessLinkStore, sessionStore, "pt");

    const response = await app.inject({
      method: "GET",
      url: "/api/content/faq",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: rawSessionId },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { locale: string; fallbackLocale: boolean; data: unknown[] };
    expect(body.fallbackLocale).toBe(true);
    expect(body.locale).toBe("es");
    expect(body.data.length).toBeGreaterThan(0);
  });
});

describe("GET /api/content/menu", () => {
  it("returns 403 feature_disabled when menu.enabled is off", async () => {
    const { app, accessLinkStore, sessionStore } = await buildTestApp({ "menu.enabled": false });
    const rawSessionId = await seedValidSession(accessLinkStore, sessionStore);

    const response = await app.inject({
      method: "GET",
      url: "/api/content/menu",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: rawSessionId },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "feature_disabled" });
  });

  it("returns tier-scoped menu content end to end, resolving tier from the reservation", async () => {
    const { app, accessLinkStore, sessionStore } = await buildTestApp({ "menu.enabled": true });
    const rawSessionId = await seedValidSession(accessLinkStore, sessionStore);

    const response = await app.inject({
      method: "GET",
      url: "/api/content/menu",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: rawSessionId },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: Array<{ title: string }> };
    // RES-1001's single leg is PRIME tier (fixture above), so PRIME's gourmet menu is returned.
    expect(body.data[0]?.title).toBe("Selección gourmet");
  });

  it("acceptance: no menu item response contains an add-to-cart, order, quantity, or price field", async () => {
    const { app, accessLinkStore, sessionStore } = await buildTestApp({ "menu.enabled": true });
    const rawSessionId = await seedValidSession(accessLinkStore, sessionStore);

    const response = await app.inject({
      method: "GET",
      url: "/api/content/menu",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: rawSessionId },
    });

    const body = response.json() as { data: Array<{ items: Array<Record<string, unknown>> }> };
    for (const section of body.data) {
      for (const item of section.items) {
        expect(item).not.toHaveProperty("addToCart");
        expect(item).not.toHaveProperty("price");
        expect(item).not.toHaveProperty("quantity");
        expect(item).not.toHaveProperty("order");
      }
    }
  });
});

describe("GET /api/content/destination/:section", () => {
  it("returns 403 feature_disabled when destination.enabled is off", async () => {
    const { app, accessLinkStore, sessionStore } = await buildTestApp({ "destination.enabled": false });
    const rawSessionId = await seedValidSession(accessLinkStore, sessionStore);

    const response = await app.inject({
      method: "GET",
      url: "/api/content/destination/poi_map",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: rawSessionId },
    });

    expect(response.statusCode).toBe(403);
  });

  it("returns 404 for an unknown section when destination.enabled is on", async () => {
    const { app, accessLinkStore, sessionStore } = await buildTestApp({ "destination.enabled": true });
    const rawSessionId = await seedValidSession(accessLinkStore, sessionStore);

    const response = await app.inject({
      method: "GET",
      url: "/api/content/destination/not-a-real-section",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: rawSessionId },
    });

    expect(response.statusCode).toBe(404);
  });

  it("returns destination content end to end, including the static poi_map media reference", async () => {
    const { app, accessLinkStore, sessionStore } = await buildTestApp({ "destination.enabled": true });
    const rawSessionId = await seedValidSession(accessLinkStore, sessionStore);

    const response = await app.inject({
      method: "GET",
      url: "/api/content/destination/poi_map",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: rawSessionId },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: { title: string; body: string } };
    expect(body.data.body).toBe("MEDIA-POI-MAP");
  });
});

describe("GET /api/content/media/:id", () => {
  it("proxies a known media asset end to end, including its contentType", async () => {
    const { app, accessLinkStore, sessionStore } = await buildTestApp();
    const rawSessionId = await seedValidSession(accessLinkStore, sessionStore);

    const response = await app.inject({
      method: "GET",
      url: "/api/content/media/MEDIA-POI-MAP",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: rawSessionId },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("image/svg+xml");
    expect(response.body).toContain("Static POI map stub");
  });

  it("returns 404 for an unknown media id", async () => {
    const { app, accessLinkStore, sessionStore } = await buildTestApp();
    const rawSessionId = await seedValidSession(accessLinkStore, sessionStore);

    const response = await app.inject({
      method: "GET",
      url: "/api/content/media/unknown-id",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: rawSessionId },
    });

    expect(response.statusCode).toBe(404);
  });
});
