import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import { describe, expect, it } from "vitest";
import { registerTripRoutes } from "./http.js";
import { DEFAULT_SESSION_COOKIE_NAME } from "../trip-access/http.js";
import { createInMemoryAccessLinkStore, type AccessLinkStore } from "../trip-access/access-link-store.js";
import { createInMemorySessionStore, type SessionStore } from "../trip-access/session-store.js";
import { generateAccessToken, hashAccessToken } from "../trip-access/token.js";
import type { SirBookingPort, SirReservation } from "../booking/ports.js";

const reservation: SirReservation = {
  reservationRef: "RES-1001",
  contact: { kind: "email", address: "ana@example.com" },
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
    },
  ],
};

function fakeSirBooking(): Pick<SirBookingPort, "getReservation" | "getRelocations"> {
  return {
    async getReservation() {
      return reservation;
    },
    async getRelocations() {
      return [];
    },
  };
}

async function buildTestApp(): Promise<{
  app: FastifyInstance;
  accessLinkStore: AccessLinkStore;
  sessionStore: SessionStore;
}> {
  const app = Fastify();
  await app.register(cookie);
  const accessLinkStore = createInMemoryAccessLinkStore();
  const sessionStore = createInMemorySessionStore();
  registerTripRoutes(app, { accessLinkStore, sessionStore, sirBooking: fakeSirBooking() });
  await app.ready();
  return { app, accessLinkStore, sessionStore };
}

async function seedValidSession(accessLinkStore: AccessLinkStore, sessionStore: SessionStore): Promise<string> {
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
    locale: "es",
  });
  return rawSessionId;
}

describe("GET /api/trip", () => {
  it("returns 401 link_expired when no session cookie is present", async () => {
    const { app } = await buildTestApp();

    const response = await app.inject({ method: "GET", url: "/api/trip" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "link_expired" });
  });

  it("returns 401 link_expired for an unknown session cookie value", async () => {
    const { app } = await buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/trip",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: "not-a-real-session-id" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "link_expired" });
  });

  it("returns the trip overview for a valid session", async () => {
    const { app, accessLinkStore, sessionStore } = await buildTestApp();
    const rawSessionId = await seedValidSession(accessLinkStore, sessionStore);

    const response = await app.inject({
      method: "GET",
      url: "/api/trip",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: rawSessionId },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { legs: Array<{ tier: string; id: string }> };
    expect(body.legs).toHaveLength(1);
    expect(body.legs[0]).toMatchObject({ id: "L1", tier: "PRIME" });
  });
});
