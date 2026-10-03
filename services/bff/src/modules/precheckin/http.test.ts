import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import { describe, expect, it } from "vitest";
import { registerPrecheckinRoutes } from "./http.js";
import { createInMemorySubmissionStore } from "./submission-store.js";
import { createPrecheckinDocumentStoreStub } from "../../adapters/precheckin-document-store/stub.js";
import { createKmsStub } from "../../infra/crypto/kms-stub.js";
import { createInMemoryConsentStore, type ConsentStore } from "../privacy/consent-store.js";
import {
  createInMemoryAccessLinkStore,
  type AccessLinkStore,
} from "../trip-access/access-link-store.js";
import { createInMemorySessionStore, type SessionStore } from "../trip-access/session-store.js";
import { DEFAULT_SESSION_COOKIE_NAME } from "../trip-access/http.js";
import { generateAccessToken, hashAccessToken } from "../trip-access/token.js";
import type { SirBookingPort, SirReservation } from "../booking/ports.js";
import type { FlagKey } from "../../config/flags.js";
import { FLAG_DEFAULTS } from "../../config/flags.js";

const RESERVATION: SirReservation = {
  reservationRef: "RES-1001",
  contact: { kind: "email", address: "ana@example.com" },
  passengers: [
    { passengerRef: "P1", ordinal: 1, displayName: "Ana Torres" },
    { passengerRef: "P2", ordinal: 2, displayName: "Luis Torres" },
  ],
  legs: [],
  tickets: [],
};

function fakeSirBooking(reservation: SirReservation = RESERVATION): Pick<SirBookingPort, "getReservation"> {
  return {
    async getReservation() {
      return reservation;
    },
  };
}

interface TestAppOptions {
  flags?: Record<FlagKey, boolean>;
  grantConsent?: boolean;
}

async function buildTestApp(options: TestAppOptions = {}): Promise<{
  app: FastifyInstance;
  accessLinkStore: AccessLinkStore;
  sessionStore: SessionStore;
  consentStore: ConsentStore;
}> {
  const app = Fastify();
  await app.register(cookie);
  await app.register(multipart);
  const accessLinkStore = createInMemoryAccessLinkStore();
  const sessionStore = createInMemorySessionStore();
  const consentStore = createInMemoryConsentStore();
  const submissionStore = createInMemorySubmissionStore();
  const documentStore = createPrecheckinDocumentStoreStub();
  const kms = createKmsStub();

  if (options.grantConsent !== false) {
    await consentStore.record({
      linkId: "seed",
      reservationRef: "RES-1001",
      passengerRef: null,
      purpose: "precheckin_biometric",
      textVersion: "v1",
      granted: true,
    });
  }

  registerPrecheckinRoutes(app, {
    accessLinkStore,
    sessionStore,
    sirBooking: fakeSirBooking(),
    consentStore,
    submissionStore,
    documentStore,
    kms,
    keyId: "test-key",
    flags: options.flags ?? { ...FLAG_DEFAULTS, "precheckin.production_collection": true, "precheckin.capture_ui": true },
  });
  await app.ready();

  return { app, accessLinkStore, sessionStore, consentStore };
}

async function seedSessionCookie(
  accessLinkStore: AccessLinkStore,
  sessionStore: SessionStore,
  overrides: { passengerScope?: string[] } = {},
): Promise<string> {
  const token = generateAccessToken();
  const link = await accessLinkStore.create({
    tokenHash: hashAccessToken(token),
    reservationRef: "RES-1001",
    passengerScope: overrides.passengerScope ?? [],
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

function buildSubmissionForm(overrides: { docType?: string; consentRecordId?: string; skipIdFront?: boolean } = {}): FormData {
  const form = new FormData();
  form.append("docType", overrides.docType ?? "DNI");
  form.append("consentRecordId", overrides.consentRecordId ?? "consent-1");
  form.append("photo", new Blob([Buffer.from("photo-bytes")], { type: "image/jpeg" }), "photo.jpg");
  if (!overrides.skipIdFront) {
    form.append("id_front", new Blob([Buffer.from("id-front-bytes")], { type: "image/jpeg" }), "id-front.jpg");
  }
  return form;
}

describe("POST /api/precheckin/:passengerOrdinal", () => {
  it("rejects a request with no session cookie", async () => {
    const { app } = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/precheckin/1",
      payload: buildSubmissionForm(),
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "link_expired" });
  });

  it("rejects with feature_disabled when precheckin.production_collection is off", async () => {
    const { app, accessLinkStore, sessionStore } = await buildTestApp({
      flags: { ...FLAG_DEFAULTS },
    });
    const sessionId = await seedSessionCookie(accessLinkStore, sessionStore);

    const response = await app.inject({
      method: "POST",
      url: "/api/precheckin/1",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: sessionId },
      payload: buildSubmissionForm(),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "feature_disabled" });
  });

  it("rejects with out_of_scope when the ordinal is excluded by the link's own passenger scope", async () => {
    const { app, accessLinkStore, sessionStore } = await buildTestApp();
    const sessionId = await seedSessionCookie(accessLinkStore, sessionStore, { passengerScope: ["P1"] });

    const response = await app.inject({
      method: "POST",
      url: "/api/precheckin/2",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: sessionId },
      payload: buildSubmissionForm(),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "out_of_scope" });
  });

  it("rejects with consent_required when precheckin_biometric consent has not been granted", async () => {
    const { app, accessLinkStore, sessionStore } = await buildTestApp({ grantConsent: false });
    const sessionId = await seedSessionCookie(accessLinkStore, sessionStore);

    const response = await app.inject({
      method: "POST",
      url: "/api/precheckin/1",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: sessionId },
      payload: buildSubmissionForm(),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "consent_required" });
  });

  it("rejects with invalid_request when the id_front image is missing", async () => {
    const { app, accessLinkStore, sessionStore } = await buildTestApp();
    const sessionId = await seedSessionCookie(accessLinkStore, sessionStore);

    const response = await app.inject({
      method: "POST",
      url: "/api/precheckin/1",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: sessionId },
      payload: buildSubmissionForm({ skipIdFront: true }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "invalid_request" });
  });

  it("accepts a valid submission and returns 201 received", async () => {
    const { app, accessLinkStore, sessionStore } = await buildTestApp();
    const sessionId = await seedSessionCookie(accessLinkStore, sessionStore);

    const response = await app.inject({
      method: "POST",
      url: "/api/precheckin/1",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: sessionId },
      payload: buildSubmissionForm(),
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ passengerOrdinal: 1, status: "received" });
  });

  it("drains an unrecognized file field instead of hanging the request", async () => {
    const { app, accessLinkStore, sessionStore } = await buildTestApp();
    const sessionId = await seedSessionCookie(accessLinkStore, sessionStore);
    const form = buildSubmissionForm();
    form.append("extra_unexpected_file", new Blob([Buffer.from("junk-bytes")], { type: "image/jpeg" }), "junk.jpg");

    const response = await app.inject({
      method: "POST",
      url: "/api/precheckin/1",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: sessionId },
      payload: form,
    });

    expect(response.statusCode).toBe(201);
  }, 2000);

  it("rejects a second submission for the same passenger with already_submitted", async () => {
    const { app, accessLinkStore, sessionStore } = await buildTestApp();
    const sessionId = await seedSessionCookie(accessLinkStore, sessionStore);
    await app.inject({
      method: "POST",
      url: "/api/precheckin/1",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: sessionId },
      payload: buildSubmissionForm(),
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/precheckin/1",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: sessionId },
      payload: buildSubmissionForm(),
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "already_submitted" });
  });

});

describe("GET /api/precheckin/status", () => {
  it("rejects a request with no session cookie", async () => {
    const { app } = await buildTestApp();

    const response = await app.inject({ method: "GET", url: "/api/precheckin/status" });

    expect(response.statusCode).toBe(401);
  });

  it("rejects with feature_disabled when precheckin.capture_ui is off", async () => {
    const { app, accessLinkStore, sessionStore } = await buildTestApp({
      flags: { ...FLAG_DEFAULTS, "precheckin.production_collection": true, "precheckin.capture_ui": false },
    });
    const sessionId = await seedSessionCookie(accessLinkStore, sessionStore);

    const response = await app.inject({
      method: "GET",
      url: "/api/precheckin/status",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: sessionId },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "feature_disabled" });
  });

  it("returns \"none\" for every scoped passenger before any submission", async () => {
    const { app, accessLinkStore, sessionStore } = await buildTestApp();
    const sessionId = await seedSessionCookie(accessLinkStore, sessionStore);

    const response = await app.inject({
      method: "GET",
      url: "/api/precheckin/status",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: sessionId },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      { passengerOrdinal: 1, status: "none" },
      { passengerOrdinal: 2, status: "none" },
    ]);
  });

  it("reflects \"received\" only for the passenger who submitted, never the image bytes", async () => {
    const { app, accessLinkStore, sessionStore } = await buildTestApp();
    const sessionId = await seedSessionCookie(accessLinkStore, sessionStore);
    await app.inject({
      method: "POST",
      url: "/api/precheckin/1",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: sessionId },
      payload: buildSubmissionForm(),
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/precheckin/status",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: sessionId },
    });

    const body = response.json() as Array<{ passengerOrdinal: number; status: string }>;
    expect(body).toEqual([
      { passengerOrdinal: 1, status: "received" },
      { passengerOrdinal: 2, status: "none" },
    ]);
    expect(JSON.stringify(body)).not.toContain("photo-bytes");
  });

  it("scopes the status list to the link's own passenger scope", async () => {
    const { app, accessLinkStore, sessionStore } = await buildTestApp();
    const sessionId = await seedSessionCookie(accessLinkStore, sessionStore, { passengerScope: ["P2"] });

    const response = await app.inject({
      method: "GET",
      url: "/api/precheckin/status",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: sessionId },
    });

    expect(response.json()).toEqual([{ passengerOrdinal: 2, status: "none" }]);
  });
});
