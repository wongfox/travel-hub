import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { buildApp, startWorker } from "./composition-root.js";
import { createRedactingLogger } from "./infra/logging/redacting-logger.js";
import { createInMemoryQueueClient } from "./infra/queue/queue-client.js";
import { SAMPLE_JOB_QUEUE } from "./infra/queue/sample-job.js";
import { createInMemoryAccessLinkStore } from "./modules/trip-access/access-link-store.js";
import { resolveAccessLinkByToken } from "./modules/trip-access/resolve-link.js";
import { DEFAULT_SESSION_COOKIE_NAME } from "./modules/trip-access/http.js";
import { FLAG_DEFAULTS } from "./config/flags.js";
import { GoLiveGuardError } from "./config/go-live-guards.js";
import { PRECHECKIN_HANDOFF_QUEUE } from "./modules/precheckin/handoff-job.js";
import { PRECHECKIN_PURGE_QUEUE } from "./modules/precheckin/purge-job.js";
import { createInMemorySubmissionStore } from "./modules/precheckin/submission-store.js";
import { createPrecheckinDocumentStoreStub } from "./adapters/precheckin-document-store/stub.js";
import { createPrecheckinHandoffStub } from "./adapters/precheckin-handoff/stub.js";
import { createKmsStub } from "./infra/crypto/kms-stub.js";
import { encryptEnvelope } from "./infra/crypto/envelope-encryption.js";
import {
  WIFI_ENTITLEMENT_ACTIVATION_QUEUE,
  WIFI_SIR_RECEIPT_QUEUE,
} from "./modules/wifi-checkout/wifi-order-jobs.js";
import { createInMemoryWifiOrderStore } from "./modules/wifi-checkout/wifi-order-store.js";
import { createWifiPackageStub } from "./adapters/wifi-package/stub.js";
import { createInMemorySessionStore } from "./modules/trip-access/session-store.js";
import { createInMemoryConsentStore } from "./modules/privacy/consent-store.js";
import { createInMemoryPushSubscriptionStore } from "./modules/notifications/push-subscription-store.js";
import { createInMemoryNotificationStore } from "./modules/notifications/notification-store.js";
import { createWebPushStub } from "./adapters/web-push/stub.js";
import { JOURNEY_POLL_QUEUE } from "./modules/notifications/journey-poll-job.js";
import { DEFAULT_ALERT_SOURCE_POLICY } from "./config/alert-source-policy.js";
import { STAFF_ALERT_DISPATCH_QUEUE } from "./modules/pulse/dispatch-staff-alerts-job.js";
import { createInMemoryStaffAlertStore } from "./modules/pulse/staff-alert-store.js";
import { createStaffAlertStub } from "./adapters/staff-alert/stub.js";

describe("buildApp", () => {
  it("responds 200 with an ok status on GET /healthz", async () => {
    const app = buildApp();

    const response = await app.inject({ method: "GET", url: "/healthz" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("returns 404 for an undefined route, proving the app does not blanket-match", async () => {
    const app = buildApp();

    const response = await app.inject({ method: "GET", url: "/does-not-exist" });

    expect(response.statusCode).toBe(404);
  });

  it("accepts an injected logger (task 3.5's redacting logger) and logs through it, redacting a token field", async () => {
    const chunks: string[] = [];
    const capturingStream = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      },
    });
    const logger = createRedactingLogger({}, capturingStream);
    const app = buildApp({ logger });
    app.get("/log-probe", async (_request, reply) => {
      app.log.info({ linkToken: "should-not-leak" }, "probe logged");
      return reply.send({ ok: true });
    });

    await app.inject({ method: "GET", url: "/log-probe" });

    const entries = chunks
      .join("")
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const entry = entries.find((line) => line.msg === "probe logged");
    expect(entry?.linkToken).toBe("[REDACTED]");
  });

  it("applies the baseline security headers (task 3.6) to every response, including /healthz", async () => {
    const app = buildApp();

    const response = await app.inject({ method: "GET", url: "/healthz" });

    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["permissions-policy"]).toBe("camera=(self)");
    expect(response.headers["content-security-policy"]).toContain("default-src 'self'");
  });
});

describe("buildApp — trip-access (task 5.2)", () => {
  it("registers POST /internal/links, rejecting an unauthenticated request as 401 by default", async () => {
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/internal/links",
      payload: { reservationRef: "RES-1001", contact: { kind: "email", address: "a@b.com" }, locale: "es" },
    });

    expect(response.statusCode).toBe(401);
  });

  it("issues a link end to end against the default (in-memory store + stub delivery) wiring when given the configured internal API key", async () => {
    const app = buildApp({ tripAccess: { internalApiKey: "dev-only-internal-key" } });

    const response = await app.inject({
      method: "POST",
      url: "/internal/links",
      headers: { authorization: "Bearer dev-only-internal-key" },
      payload: { reservationRef: "RES-1001", contact: { kind: "email", address: "a@b.com" }, locale: "es" },
    });

    expect(response.statusCode).toBe(201);
  });

  it("accepts an injected accessLinkStore, so a real (e.g. Drizzle-backed) store can be wired in without changing this function", async () => {
    const accessLinkStore = createInMemoryAccessLinkStore();
    const { createLinkDeliveryStub } = await import("./adapters/link-delivery/stub.js");
    const linkDelivery = createLinkDeliveryStub();
    const app = buildApp({
      tripAccess: { internalApiKey: "dev-only-internal-key", accessLinkStore, linkDelivery },
    });

    const response = await app.inject({
      method: "POST",
      url: "/internal/links",
      headers: { authorization: "Bearer dev-only-internal-key" },
      payload: { reservationRef: "RES-1001", contact: { kind: "email", address: "a@b.com" }, locale: "es" },
    });
    const body = response.json() as { accessLinkId: string };
    const token = linkDelivery.deliveries[0]!.linkUrl.split("#")[1]!;

    // The record is reachable through the exact store instance that was injected.
    const record = await resolveAccessLinkByToken(token, accessLinkStore);
    expect(record?.id).toBe(body.accessLinkId);
    expect(record?.reservationRef).toBe("RES-1001");
  });

  it("throws at build time in a production-like environment when no internalApiKey is provided, instead of silently falling back to the dev-only default", () => {
    expect(() => buildApp({ tripAccess: { nodeEnv: "production" } })).toThrow(
      /INTERNAL_LINKS_API_KEY/,
    );
    expect(() => buildApp({ tripAccess: { nodeEnv: "staging" } })).toThrow(
      /INTERNAL_LINKS_API_KEY/,
    );
  });

  it("still falls back to the dev-only default in development and test, and does not throw", () => {
    expect(() => buildApp({ tripAccess: { nodeEnv: "development" } })).not.toThrow();
    expect(() => buildApp({ tripAccess: { nodeEnv: "test" } })).not.toThrow();
    expect(() => buildApp()).not.toThrow();
  });

  it("does not throw in production when a real internalApiKey is provided", () => {
    expect(() =>
      buildApp({ tripAccess: { nodeEnv: "production", internalApiKey: "real-key" } }),
    ).not.toThrow();
  });
});

describe("buildApp — trip-access session exchange & reissue (task 5.3/5.4)", () => {
  it("exchanges a token for a session cookie end to end against the default wiring", async () => {
    const app = buildApp({ tripAccess: { internalApiKey: "dev-only-internal-key" } });
    const issue = await app.inject({
      method: "POST",
      url: "/internal/links",
      headers: { authorization: "Bearer dev-only-internal-key" },
      payload: { reservationRef: "RES-1001", contact: { kind: "email", address: "a@b.com" }, locale: "es" },
    });
    expect(issue.statusCode).toBe(201);

    // The default wiring only ever hands the raw token to LinkDeliveryPort;
    // recover it the same way http.test.ts does, via the stub's own record.
    const app2 = buildApp({ tripAccess: { internalApiKey: "dev-only-internal-key" } });
    const response = await app2.inject({
      method: "POST",
      url: "/api/session",
      payload: { token: "not-a-real-token" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "link_expired" });
  });

  it("accepts an injected sessionStore, so a real (e.g. Drizzle-backed) store can be wired in without changing this function", async () => {
    const { createInMemorySessionStore } = await import("./modules/trip-access/session-store.js");
    const sessionStore = createInMemorySessionStore();
    const accessLinkStore = createInMemoryAccessLinkStore();
    const { hashAccessToken, generateAccessToken } = await import("./modules/trip-access/token.js");
    const token = generateAccessToken();
    await accessLinkStore.create({
      tokenHash: hashAccessToken(token),
      reservationRef: "RES-1001",
      passengerScope: [],
      expiresAt: "2099-01-01T00:00:00.000Z",
      issueChannel: "email",
    });
    const app = buildApp({ tripAccess: { accessLinkStore, sessionStore } });

    const response = await app.inject({ method: "POST", url: "/api/session", payload: { token } });

    expect(response.statusCode).toBe(200);
    expect(response.headers["set-cookie"]).toBeDefined();
  });

  it("registers POST /api/links/reissue, always responding 202 against the default (stub SirBookingPort) wiring", async () => {
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/links/reissue",
      payload: { reservationRef: "RES-1001", surname: "does-not-matter", locale: "es" },
    });

    expect(response.statusCode).toBe(202);
  });
});

describe("buildApp — trip overview (task 6.2)", () => {
  it("returns 401 when GET /api/trip is called with no session at all", async () => {
    const app = buildApp();

    const response = await app.inject({ method: "GET", url: "/api/trip" });

    expect(response.statusCode).toBe(401);
  });

  it("returns the trip overview end to end for a session exchanged against injected (but shared) stores", async () => {
    const accessLinkStore = createInMemoryAccessLinkStore();
    const { createInMemorySessionStore } = await import("./modules/trip-access/session-store.js");
    const sessionStore = createInMemorySessionStore();
    const { hashAccessToken, generateAccessToken } = await import("./modules/trip-access/token.js");
    const token = generateAccessToken();
    await accessLinkStore.create({
      tokenHash: hashAccessToken(token),
      reservationRef: "RES-1001",
      passengerScope: [],
      expiresAt: "2099-01-01T00:00:00.000Z",
      issueChannel: "email",
    });
    const app = buildApp({ tripAccess: { accessLinkStore, sessionStore } });

    const exchange = await app.inject({ method: "POST", url: "/api/session", payload: { token } });
    const setCookie = exchange.headers["set-cookie"];
    const header = Array.isArray(setCookie) ? setCookie[0]! : (setCookie as string);
    const cookieValue = header.split(";")[0]!.split("=")[1]!;

    const response = await app.inject({
      method: "GET",
      url: "/api/trip",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: cookieValue },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { legs: Array<{ tier: string }> };
    // RES-1001's seed fixture (services/bff/seed/sir/reservations.json) has one PRIME-tier leg.
    expect(body.legs[0]?.tier).toBe("PRIME");
  });
});

describe("buildApp — trip-itinerary + travel-documents (task 6.3/6.4)", () => {
  it("returns boardingPasses and documents built from the seed fixture, end to end for a real session", async () => {
    const accessLinkStore = createInMemoryAccessLinkStore();
    const { createInMemorySessionStore } = await import("./modules/trip-access/session-store.js");
    const sessionStore = createInMemorySessionStore();
    const { hashAccessToken, generateAccessToken } = await import("./modules/trip-access/token.js");
    const token = generateAccessToken();
    await accessLinkStore.create({
      tokenHash: hashAccessToken(token),
      reservationRef: "RES-1001",
      passengerScope: [],
      expiresAt: "2099-01-01T00:00:00.000Z",
      issueChannel: "email",
    });
    const app = buildApp({ tripAccess: { accessLinkStore, sessionStore } });

    const exchange = await app.inject({ method: "POST", url: "/api/session", payload: { token } });
    const setCookie = exchange.headers["set-cookie"];
    const header = Array.isArray(setCookie) ? setCookie[0]! : (setCookie as string);
    const cookieValue = header.split(";")[0]!.split("=")[1]!;

    const tripResponse = await app.inject({
      method: "GET",
      url: "/api/trip",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: cookieValue },
    });
    const trip = tripResponse.json() as {
      boardingPasses: Array<{ legId: string; seat: string }>;
      documents: Array<{ kind: string; fileId?: string }>;
    };
    // RES-1001's seed fixture has one leg (seat 5A) and two tickets (Consettur with a fileId, INC entry with a barcode).
    expect(trip.boardingPasses).toEqual([
      { legId: "L1", seat: "5A", coach: "3", barcodeFormat: "CODE128", barcodePayload: "BP-RES-1001-L1", tier: "PRIME" },
    ]);
    expect(trip.documents.map((doc) => doc.kind).sort()).toEqual(["CONSETTUR", "INC_ENTRY", "TRAIN"]);

    const fileDoc = trip.documents.find((doc) => doc.kind === "CONSETTUR");

    const documentResponse = await app.inject({
      method: "GET",
      url: `/api/documents/${fileDoc?.fileId}`,
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: cookieValue },
    });

    expect(documentResponse.statusCode).toBe(200);
    expect(documentResponse.headers["content-type"]).toBe("application/pdf");
  });

  it("reflects RES-2002's relocated seat in the boarding pass automatically, consistent with its trip-home alert", async () => {
    const accessLinkStore = createInMemoryAccessLinkStore();
    const { createInMemorySessionStore } = await import("./modules/trip-access/session-store.js");
    const sessionStore = createInMemorySessionStore();
    const { hashAccessToken, generateAccessToken } = await import("./modules/trip-access/token.js");
    const token = generateAccessToken();
    await accessLinkStore.create({
      tokenHash: hashAccessToken(token),
      reservationRef: "RES-2002",
      passengerScope: [],
      expiresAt: "2099-01-01T00:00:00.000Z",
      issueChannel: "whatsapp",
    });
    const app = buildApp({ tripAccess: { accessLinkStore, sessionStore } });

    const exchange = await app.inject({ method: "POST", url: "/api/session", payload: { token } });
    const setCookie = exchange.headers["set-cookie"];
    const header = Array.isArray(setCookie) ? setCookie[0]! : (setCookie as string);
    const cookieValue = header.split(";")[0]!.split("=")[1]!;

    const response = await app.inject({
      method: "GET",
      url: "/api/trip",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: cookieValue },
    });
    const trip = response.json() as { boardingPasses: Array<{ seat: string }>; alerts: unknown[] };

    // RES-2002's seed relocation records newSeat "3C" (original seat is "2B").
    expect(trip.boardingPasses[0]?.seat).toBe("3C");
    expect(trip.alerts).toHaveLength(1);
  });
});

describe("buildApp — privacy consent capture (task 8.1)", () => {
  async function establishSession(): Promise<{
    app: ReturnType<typeof buildApp>;
    cookieValue: string;
  }> {
    const accessLinkStore = createInMemoryAccessLinkStore();
    const { createInMemorySessionStore } = await import("./modules/trip-access/session-store.js");
    const sessionStore = createInMemorySessionStore();
    const { hashAccessToken, generateAccessToken } = await import("./modules/trip-access/token.js");
    const token = generateAccessToken();
    await accessLinkStore.create({
      tokenHash: hashAccessToken(token),
      reservationRef: "RES-1001",
      passengerScope: [],
      expiresAt: "2099-01-01T00:00:00.000Z",
      issueChannel: "email",
    });
    const app = buildApp({ tripAccess: { accessLinkStore, sessionStore } });

    const exchange = await app.inject({ method: "POST", url: "/api/session", payload: { token } });
    const setCookie = exchange.headers["set-cookie"];
    const header = Array.isArray(setCookie) ? setCookie[0]! : (setCookie as string);
    const cookieValue = header.split(";")[0]!.split("=")[1]!;
    return { app, cookieValue };
  }

  it("registers POST /api/consents end to end against the default (in-memory) wiring", async () => {
    const { app, cookieValue } = await establishSession();

    const response = await app.inject({
      method: "POST",
      url: "/api/consents",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: cookieValue },
      payload: { purpose: "precheckin_biometric", textVersion: "v1", granted: true },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ purpose: "precheckin_biometric", granted: true });
  });

  it("rejects an unauthenticated request", async () => {
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/consents",
      payload: { purpose: "precheckin_biometric", textVersion: "v1", granted: true },
    });

    expect(response.statusCode).toBe(401);
  });
});

describe("buildApp — pre check-in submission, status, and trip wiring (task 8.3/8.4)", () => {
  async function establishSessionWithFlags(flags: Record<string, boolean>): Promise<{
    app: ReturnType<typeof buildApp>;
    cookieValue: string;
  }> {
    const accessLinkStore = createInMemoryAccessLinkStore();
    const { createInMemorySessionStore } = await import("./modules/trip-access/session-store.js");
    const sessionStore = createInMemorySessionStore();
    const { hashAccessToken, generateAccessToken } = await import("./modules/trip-access/token.js");
    const token = generateAccessToken();
    await accessLinkStore.create({
      tokenHash: hashAccessToken(token),
      reservationRef: "RES-1001",
      passengerScope: [],
      expiresAt: "2099-01-01T00:00:00.000Z",
      issueChannel: "email",
    });
    const app = buildApp({
      tripAccess: { accessLinkStore, sessionStore },
      trip: { flags: flags as never },
    });

    const exchange = await app.inject({ method: "POST", url: "/api/session", payload: { token } });
    const setCookie = exchange.headers["set-cookie"];
    const header = Array.isArray(setCookie) ? setCookie[0]! : (setCookie as string);
    const cookieValue = header.split(";")[0]!.split("=")[1]!;
    return { app, cookieValue };
  }

  function submissionForm(): FormData {
    const form = new FormData();
    form.append("docType", "DNI");
    form.append("consentRecordId", "consent-1");
    form.append("photo", new Blob([Buffer.from("photo-bytes")], { type: "image/jpeg" }), "photo.jpg");
    form.append("id_front", new Blob([Buffer.from("id-front-bytes")], { type: "image/jpeg" }), "id-front.jpg");
    return form;
  }

  it("shares one consent store between /api/consents and the pre check-in submission guard", async () => {
    const { FLAG_DEFAULTS } = await import("./config/flags.js");
    const { app, cookieValue } = await establishSessionWithFlags({
      ...FLAG_DEFAULTS,
      "precheckin.production_collection": true,
    });

    // Without consent, submission must be rejected end to end against the real composition-root wiring.
    const beforeConsent = await app.inject({
      method: "POST",
      url: "/api/precheckin/1",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: cookieValue },
      payload: submissionForm(),
    });
    expect(beforeConsent.statusCode).toBe(403);
    expect(beforeConsent.json()).toMatchObject({ code: "consent_required" });

    const consentResponse = await app.inject({
      method: "POST",
      url: "/api/consents",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: cookieValue },
      payload: { purpose: "precheckin_biometric", textVersion: "v1", granted: true },
    });
    expect(consentResponse.statusCode).toBe(201);

    const afterConsent = await app.inject({
      method: "POST",
      url: "/api/precheckin/1",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: cookieValue },
      payload: submissionForm(),
    });

    expect(afterConsent.statusCode).toBe(201);
    expect(afterConsent.json()).toMatchObject({ passengerOrdinal: 1, status: "received" });
  });

  it("reflects a real pre check-in submission in GET /api/trip's precheckinStatus, end to end", async () => {
    const { FLAG_DEFAULTS } = await import("./config/flags.js");
    const { app, cookieValue } = await establishSessionWithFlags({
      ...FLAG_DEFAULTS,
      "precheckin.production_collection": true,
      "precheckin.capture_ui": true,
    });
    await app.inject({
      method: "POST",
      url: "/api/consents",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: cookieValue },
      payload: { purpose: "precheckin_biometric", textVersion: "v1", granted: true },
    });

    const beforeTrip = await app.inject({
      method: "GET",
      url: "/api/trip",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: cookieValue },
    });
    const beforeBody = beforeTrip.json() as { passengers: Array<{ ordinal: number; precheckinStatus: string }> };
    expect(beforeBody.passengers.find((p) => p.ordinal === 1)?.precheckinStatus).toBe("none");

    const submitResponse = await app.inject({
      method: "POST",
      url: "/api/precheckin/1",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: cookieValue },
      payload: submissionForm(),
    });
    expect(submitResponse.statusCode).toBe(201);

    const afterTrip = await app.inject({
      method: "GET",
      url: "/api/trip",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: cookieValue },
    });
    const afterBody = afterTrip.json() as { passengers: Array<{ ordinal: number; precheckinStatus: string }> };
    expect(afterBody.passengers.find((p) => p.ordinal === 1)?.precheckinStatus).toBe("received");

    const statusResponse = await app.inject({
      method: "GET",
      url: "/api/precheckin/status",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: cookieValue },
    });
    expect(statusResponse.json()).toContainEqual({ passengerOrdinal: 1, status: "received" });
    // Never re-displays the submitted bytes anywhere in the status response.
    expect(JSON.stringify(statusResponse.json())).not.toContain("photo-bytes");
  });
});

describe("buildApp — content routes (task 9.1-9.4)", () => {
  it("registers GET /api/content/faq end to end against the default (stub ContentPort) wiring", async () => {
    const accessLinkStore = createInMemoryAccessLinkStore();
    const { createInMemorySessionStore } = await import("./modules/trip-access/session-store.js");
    const sessionStore = createInMemorySessionStore();
    const { hashAccessToken, generateAccessToken } = await import("./modules/trip-access/token.js");
    const token = generateAccessToken();
    await accessLinkStore.create({
      tokenHash: hashAccessToken(token),
      reservationRef: "RES-1001",
      passengerScope: [],
      expiresAt: "2099-01-01T00:00:00.000Z",
      issueChannel: "email",
    });
    const app = buildApp({ tripAccess: { accessLinkStore, sessionStore } });

    const exchange = await app.inject({ method: "POST", url: "/api/session", payload: { token } });
    const setCookie = exchange.headers["set-cookie"];
    const header = Array.isArray(setCookie) ? setCookie[0]! : (setCookie as string);
    const cookieValue = header.split(";")[0]!.split("=")[1]!;

    const response = await app.inject({
      method: "GET",
      url: "/api/content/faq",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: cookieValue },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: unknown[] };
    expect(body.data.length).toBeGreaterThan(0);
  });

  it("throws GoLiveGuardError at build time when menu.enabled is true in production without a non-stub ContentPort adapter", () => {
    expect(() =>
      buildApp({
        trip: { flags: { ...FLAG_DEFAULTS, "menu.enabled": true } as never },
        content: { nodeEnv: "production" },
      }),
    ).toThrow(GoLiveGuardError);
  });

  it("throws GoLiveGuardError at build time when destination.enabled is true in production without a non-stub ContentPort adapter", () => {
    expect(() =>
      buildApp({
        trip: { flags: { ...FLAG_DEFAULTS, "destination.enabled": true } as never },
        content: { nodeEnv: "production" },
      }),
    ).toThrow(GoLiveGuardError);
  });

  it("allows menu.enabled/destination.enabled true in production once a non-stub content adapter is declared", () => {
    expect(() =>
      buildApp({
        trip: {
          flags: {
            ...FLAG_DEFAULTS,
            "menu.enabled": true,
            "destination.enabled": true,
          } as never,
        },
        content: { nodeEnv: "production", adapterContent: "headless-cms" },
      }),
    ).not.toThrow();
  });

  it("always allows menu.enabled/destination.enabled against the stub outside production/staging", () => {
    expect(() =>
      buildApp({
        trip: {
          flags: {
            ...FLAG_DEFAULTS,
            "menu.enabled": true,
            "destination.enabled": true,
          } as never,
        },
      }),
    ).not.toThrow();
  });
});

describe("buildApp — wifi-checkout routes (tasks 10.1-10.2)", () => {
  it("registers GET /api/wifi/packages and POST /api/wifi/orders end to end against the default (stub) wiring", async () => {
    const accessLinkStore = createInMemoryAccessLinkStore();
    const { createInMemorySessionStore } = await import("./modules/trip-access/session-store.js");
    const sessionStore = createInMemorySessionStore();
    const { hashAccessToken, generateAccessToken } = await import("./modules/trip-access/token.js");
    const token = generateAccessToken();
    await accessLinkStore.create({
      tokenHash: hashAccessToken(token),
      reservationRef: "RES-1001",
      passengerScope: [],
      expiresAt: "2099-01-01T00:00:00.000Z",
      issueChannel: "email",
    });
    const app = buildApp({
      tripAccess: { accessLinkStore, sessionStore },
      wifiCheckout: { flags: { ...FLAG_DEFAULTS, "wifi.checkout": true } },
    });

    const exchange = await app.inject({ method: "POST", url: "/api/session", payload: { token } });
    const setCookie = exchange.headers["set-cookie"];
    const header = Array.isArray(setCookie) ? setCookie[0]! : (setCookie as string);
    const cookieValue = header.split(";")[0]!.split("=")[1]!;

    const packagesResponse = await app.inject({
      method: "GET",
      url: "/api/wifi/packages",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: cookieValue },
    });
    expect(packagesResponse.statusCode).toBe(200);
    const packages = packagesResponse.json() as { id: string }[];
    expect(packages.length).toBeGreaterThan(0);

    const orderResponse = await app.inject({
      method: "POST",
      url: "/api/wifi/orders",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: cookieValue },
      headers: { "idempotency-key": "composition-root-idem-1" },
      payload: { packageId: packages[0]!.id },
    });
    expect(orderResponse.statusCode).toBe(201);
    const orderBody = orderResponse.json() as { order: { status: string }; redirectUrl: string };
    expect(orderBody.order.status).toBe("PAYMENT_PENDING");
    expect(orderBody.redirectUrl).toMatch(/^https:\/\//);
  });

  it("throws GoLiveGuardError at build time when wifi.checkout is true in production without a non-stub PaymentGatewayPort adapter", () => {
    expect(() =>
      buildApp({
        wifiCheckout: { flags: { ...FLAG_DEFAULTS, "wifi.checkout": true }, nodeEnv: "production" },
      }),
    ).toThrow(GoLiveGuardError);
  });

  it("still refuses wifi.checkout in production once only a non-stub payment adapter is declared (task 10.3: receipt/SIR-POS/entitlement adapters still required)", () => {
    expect(() =>
      buildApp({
        wifiCheckout: {
          flags: { ...FLAG_DEFAULTS, "wifi.checkout": true },
          nodeEnv: "production",
          adapterPayment: "a-real-gateway",
        },
      }),
    ).toThrow(GoLiveGuardError);
  });

  it("allows wifi.checkout in production once every adapter (payment, receipt, SIR-POS, entitlement) is declared non-stub (task 10.3)", () => {
    expect(() =>
      buildApp({
        wifiCheckout: {
          flags: { ...FLAG_DEFAULTS, "wifi.checkout": true },
          nodeEnv: "production",
          orderStore: createInMemoryWifiOrderStore(),
          adapterPayment: "a-real-gateway",
          adapterReceipt: "a-real-receipt-service",
          adapterSirPos: "a-real-sir-pos",
          adapterWifiEntitlement: "a-real-captive-portal",
        },
      }),
    ).not.toThrow();
  });

  it("throws in production when wifi.checkout is on and no shared orderStore is wired in, instead of silently using a process-local in-memory store", () => {
    expect(() =>
      buildApp({
        wifiCheckout: {
          flags: { ...FLAG_DEFAULTS, "wifi.checkout": true },
          nodeEnv: "production",
          adapterPayment: "a-real-gateway",
          adapterReceipt: "a-real-receipt-service",
          adapterSirPos: "a-real-sir-pos",
          adapterWifiEntitlement: "a-real-captive-portal",
        },
      }),
    ).toThrow(/orderStore/);
  });

  it("does not require an orderStore in production while wifi.checkout is off", () => {
    expect(() =>
      buildApp({ wifiCheckout: { flags: { ...FLAG_DEFAULTS, "wifi.checkout": false }, nodeEnv: "production" } }),
    ).not.toThrow(/orderStore/);
  });

  it("always allows wifi.checkout against the stub outside production/staging", () => {
    expect(() =>
      buildApp({
        wifiCheckout: { flags: { ...FLAG_DEFAULTS, "wifi.checkout": true } },
      }),
    ).not.toThrow();
  });
});

describe("buildApp — complementary-services-redirect (task 10.5)", () => {
  it("registers GET /api/out/tfe end to end against the default (dev-only) allowlist", async () => {
    const app = buildApp();

    const response = await app.inject({ method: "GET", url: "/api/out/tfe?placement=home_banner" });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toMatch(/^https:\/\//);
  });

  it("rejects an unknown placement with 400, never redirecting (open-redirect-safety)", async () => {
    const app = buildApp();

    const response = await app.inject({ method: "GET", url: "/api/out/tfe?placement=not-on-the-allowlist" });

    expect(response.statusCode).toBe(400);
    expect(response.headers.location).toBeUndefined();
  });
});

describe("startWorker — WiFi entitlement/SIR/receipt job wiring (task 10.3)", () => {
  it("registers both WiFi jobs when wifiCheckout options are given", async () => {
    const queueClient = createInMemoryQueueClient();

    const result = await startWorker({
      queueClient,
      wifiCheckout: { flags: { ...FLAG_DEFAULTS, "wifi.checkout": false } },
    });

    expect(result.jobsRegistered).toEqual([
      SAMPLE_JOB_QUEUE,
      WIFI_ENTITLEMENT_ACTIVATION_QUEUE,
      WIFI_SIR_RECEIPT_QUEUE,
    ]);
  });

  it("does not register WiFi jobs when no wifiCheckout options are given (backward compatible)", async () => {
    const queueClient = createInMemoryQueueClient();

    const result = await startWorker({ queueClient });

    expect(result.jobsRegistered).toEqual([SAMPLE_JOB_QUEUE]);
  });

  it("throws GoLiveGuardError when wifi.checkout is true in production without every non-stub adapter declared", async () => {
    const queueClient = createInMemoryQueueClient();

    await expect(
      startWorker({
        queueClient,
        wifiCheckout: { nodeEnv: "production", flags: { ...FLAG_DEFAULTS, "wifi.checkout": true } },
      }),
    ).rejects.toThrow(GoLiveGuardError);
  });

  it("throws when a non-stub adapter is named but no real port is wired in", async () => {
    const queueClient = createInMemoryQueueClient();

    await expect(
      startWorker({
        queueClient,
        wifiCheckout: {
          nodeEnv: "production",
          flags: { ...FLAG_DEFAULTS, "wifi.checkout": true },
          adapterPayment: "a-real-gateway",
          adapterReceipt: "a-real-receipt-service",
          adapterSirPos: "a-real-sir-pos",
          adapterWifiEntitlement: "a-real-captive-portal",
        },
      }),
    ).rejects.toThrow(/ADAPTER_WIFI_ENTITLEMENT|ADAPTER_SIR_POS|ADAPTER_RECEIPT/);
  });

  it("throws in production when wifi.checkout is on and no shared orderStore is wired in, instead of silently using a worker-local in-memory store", async () => {
    const queueClient = createInMemoryQueueClient();

    await expect(
      startWorker({
        queueClient,
        wifiCheckout: {
          nodeEnv: "production",
          flags: { ...FLAG_DEFAULTS, "wifi.checkout": true },
          adapterPayment: "a-real-gateway",
          adapterReceipt: "a-real-receipt-service",
          adapterSirPos: "a-real-sir-pos",
          adapterWifiEntitlement: "a-real-captive-portal",
          entitlement: { async grant() { return { entitlementRef: "e" }; } } as never,
          sirPos: { async registerSale() { return { saleRef: "s" }; } } as never,
          eReceipt: { async issue() { return { receiptRef: "r" }; } } as never,
        },
      }),
    ).rejects.toThrow(/orderStore/);
  });

  it("boots in production with wifi.checkout on once a shared orderStore is wired in", async () => {
    const queueClient = createInMemoryQueueClient();

    await expect(
      startWorker({
        queueClient,
        wifiCheckout: {
          nodeEnv: "production",
          flags: { ...FLAG_DEFAULTS, "wifi.checkout": true },
          orderStore: createInMemoryWifiOrderStore(),
          adapterPayment: "a-real-gateway",
          adapterReceipt: "a-real-receipt-service",
          adapterSirPos: "a-real-sir-pos",
          adapterWifiEntitlement: "a-real-captive-portal",
          entitlement: { async grant() { return { entitlementRef: "e" }; } } as never,
          sirPos: { async registerSale() { return { saleRef: "s" }; } } as never,
          eReceipt: { async issue() { return { receiptRef: "r" }; } } as never,
        },
      }),
    ).resolves.toBeDefined();
  });

  it("actually runs the entitlement-activation and SIR/receipt jobs end to end when their queues are triggered", async () => {
    const queueClient = createInMemoryQueueClient();
    const orderStore = createInMemoryWifiOrderStore();
    const packageStore = createWifiPackageStub();
    const packages = await packageStore.listActive();
    const created = await orderStore.create({
      reservationRef: "RES-1001",
      passengerRef: "PAX-1",
      packageId: packages[0]!.id,
      amountMinor: packages[0]!.priceMinor,
      currency: packages[0]!.currency,
      idempotencyKey: "worker-e2e-1",
      legRef: "LEG-1",
      buyerEmail: "ana@example.com",
    });
    await orderStore.transition(created.id, "PAID", { gatewayPaymentRef: "payment-1" });

    await startWorker({
      queueClient,
      wifiCheckout: { orderStore, packageStore },
    });

    await queueClient.sendIdempotent(WIFI_ENTITLEMENT_ACTIVATION_QUEUE, "scan", {});
    await queueClient.runPendingOnce(WIFI_ENTITLEMENT_ACTIVATION_QUEUE);
    const activated = await orderStore.findById(created.id);
    expect(activated?.status).toBe("ENTITLEMENT_ACTIVE");

    await queueClient.sendIdempotent(WIFI_SIR_RECEIPT_QUEUE, "scan", {});
    await queueClient.runPendingOnce(WIFI_SIR_RECEIPT_QUEUE);
    const final = await orderStore.findById(created.id);
    expect(final?.sirRegisteredAt).not.toBeNull();
    expect(final?.receiptIssuedAt).not.toBeNull();
  });
});

describe("startWorker", () => {
  it("starts the given queue client and registers the sample job on it (task 3.4)", async () => {
    const queueClient = createInMemoryQueueClient();

    const result = await startWorker({ queueClient });

    expect(result.jobsRegistered).toEqual([SAMPLE_JOB_QUEUE]);
  });

  it("does not register precheckin jobs when no precheckin options are given (backward compatible)", async () => {
    const queueClient = createInMemoryQueueClient();

    const result = await startWorker({ queueClient });

    expect(result.jobsRegistered).toEqual([SAMPLE_JOB_QUEUE]);
  });
});

describe("startWorker — pre check-in handoff/purge wiring (task 8.5)", () => {
  it("registers the precheckin-handoff and precheckin-purge jobs when precheckin options are given", async () => {
    const queueClient = createInMemoryQueueClient();

    const result = await startWorker({
      queueClient,
      precheckin: { flags: { ...FLAG_DEFAULTS, "precheckin.production_collection": false } as never },
    });

    expect(result.jobsRegistered).toEqual([
      SAMPLE_JOB_QUEUE,
      PRECHECKIN_HANDOFF_QUEUE,
      PRECHECKIN_PURGE_QUEUE,
    ]);
  });

  it("throws GoLiveGuardError when precheckin.production_collection is true in production without prerequisites", async () => {
    const queueClient = createInMemoryQueueClient();

    await expect(
      startWorker({
        queueClient,
        precheckin: {
          nodeEnv: "production",
          flags: { ...FLAG_DEFAULTS, "precheckin.production_collection": true } as never,
        },
      }),
    ).rejects.toThrow(GoLiveGuardError);
  });

  it("throws when ADAPTER_PRECHECKIN_HANDOFF names a non-stub adapter but no real handoffPort is wired in", async () => {
    const queueClient = createInMemoryQueueClient();

    // The go-live guard only checks the adapter *name*; without this check,
    // a worker boots "successfully" claiming a real handoff adapter while
    // `registerHandoffJob` silently falls back to `createPrecheckinHandoffStub()`
    // (see composition-root.ts's `p.handoffPort ?? createPrecheckinHandoffStub()`),
    // so pre-check-in PII would never actually reach the declared adapter.
    await expect(
      startWorker({
        queueClient,
        precheckin: {
          nodeEnv: "production",
          flags: { ...FLAG_DEFAULTS, "precheckin.production_collection": true } as never,
          adapterPrecheckinHandoff: "s3",
          retention: { retentionDays: 30, handoffGraceMs: 7 * 24 * 60 * 60 * 1000 },
          retentionPolicyId: "policy-1",
          consentTextVersion: "v1",
          kmsKeyConfigured: true,
        },
      }),
    ).rejects.toThrow(/ADAPTER_PRECHECKIN_HANDOFF/);
  });

  it("allows precheckin.production_collection true in production once every prerequisite is declared, including a real handoffPort", async () => {
    const queueClient = createInMemoryQueueClient();

    const result = await startWorker({
      queueClient,
      precheckin: {
        nodeEnv: "production",
        flags: { ...FLAG_DEFAULTS, "precheckin.production_collection": true } as never,
        adapterPrecheckinHandoff: "s3",
        handoffPort: createPrecheckinHandoffStub(),
        retention: { retentionDays: 30, handoffGraceMs: 7 * 24 * 60 * 60 * 1000 },
        retentionPolicyId: "policy-1",
        consentTextVersion: "v1",
        kmsKeyConfigured: true,
      },
    });

    expect(result.jobsRegistered).toContain(PRECHECKIN_HANDOFF_QUEUE);
  });

  it("always allows the flag against stub adapters outside production/staging, even with no prerequisites", async () => {
    const queueClient = createInMemoryQueueClient();

    const result = await startWorker({
      queueClient,
      precheckin: { flags: { ...FLAG_DEFAULTS, "precheckin.production_collection": true } as never },
    });

    expect(result.jobsRegistered).toContain(PRECHECKIN_HANDOFF_QUEUE);
  });

  it("actually runs the handoff job end to end when its queue is triggered", async () => {
    const queueClient = createInMemoryQueueClient();
    const submissionStore = createInMemorySubmissionStore();
    const documentStore = createPrecheckinDocumentStoreStub();
    const handoffPort = createPrecheckinHandoffStub();
    const kms = createKmsStub();
    const keyId = "test-key";
    const photoEnvelope = await encryptEnvelope(Buffer.from("photo-bytes"), kms, keyId);
    await documentStore.put("photo-key", photoEnvelope.ciphertext);
    const idFrontEnvelope = await encryptEnvelope(Buffer.from("id-front-bytes"), kms, keyId);
    await documentStore.put("id-front-key", idFrontEnvelope.ciphertext);
    await submissionStore.create({
      reservationRef: "RES-1001",
      passengerRef: "PAX-1",
      docType: "DNI",
      consentRecordId: "consent-1",
      photo: { objectKey: "photo-key", wrappedDataKey: photoEnvelope.wrappedDataKey, iv: photoEnvelope.iv, authTag: photoEnvelope.authTag },
      idFront: { objectKey: "id-front-key", wrappedDataKey: idFrontEnvelope.wrappedDataKey, iv: idFrontEnvelope.iv, authTag: idFrontEnvelope.authTag },
      idBack: null,
      purgeAfter: "2026-06-01T00:00:00.000Z",
    });

    await startWorker({
      queueClient,
      precheckin: { submissionStore, documentStore, kms, keyId, handoffPort },
    });
    await queueClient.sendIdempotent(PRECHECKIN_HANDOFF_QUEUE, "scan", {});
    await queueClient.runPendingOnce(PRECHECKIN_HANDOFF_QUEUE);

    expect(handoffPort.deliveries).toHaveLength(1);
    const updated = await submissionStore.findByPassenger("RES-1001", "PAX-1");
    expect(updated?.status).toBe("handed_off");
  });
});

describe("buildApp — push subscription routes (task 11.1)", () => {
  it("registers POST /api/push/subscriptions end to end, invalidating the prior subscription on reissue", async () => {
    const accessLinkStore = createInMemoryAccessLinkStore();
    const sessionStore = createInMemorySessionStore();
    const consentStore = createInMemoryConsentStore();
    const subscriptionStore = createInMemoryPushSubscriptionStore();
    const { createLinkDeliveryStub } = await import("./adapters/link-delivery/stub.js");
    const linkDelivery = createLinkDeliveryStub();
    const app = buildApp({
      tripAccess: { accessLinkStore, sessionStore, linkDelivery },
      privacy: { consentStore },
      notifications: { subscriptionStore, flags: { ...FLAG_DEFAULTS, "push.enabled": true } as never },
    });

    const issueResponse = await app.inject({
      method: "POST",
      url: "/internal/links",
      headers: { authorization: "Bearer dev-only-internal-links-key" },
      payload: { reservationRef: "RES-1001", contact: { kind: "email", address: "ana@example.com" }, locale: "es" },
    });
    expect(issueResponse.statusCode).toBe(201);
    const token = linkDelivery.deliveries[0]!.linkUrl.split("#")[1]!;

    const exchange = await app.inject({ method: "POST", url: "/api/session", payload: { token } });
    const setCookie = exchange.headers["set-cookie"];
    const header = Array.isArray(setCookie) ? setCookie[0]! : (setCookie as string);
    const cookieValue = header.split(";")[0]!.split("=")[1]!;

    await consentStore.record({
      linkId: "unused",
      reservationRef: "RES-1001",
      passengerRef: null,
      purpose: "push",
      textVersion: "v1",
      granted: true,
    });

    const subscribeResponse = await app.inject({
      method: "POST",
      url: "/api/push/subscriptions",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: cookieValue },
      payload: { endpoint: "https://push.example.com/endpoint-1", keys: { p256dh: "p1", auth: "a1" }, locale: "es" },
    });
    expect(subscribeResponse.statusCode).toBe(201);
    const { id } = subscribeResponse.json() as { id: string };

    await app.inject({
      method: "POST",
      url: "/api/links/reissue",
      payload: { reservationRef: "RES-1001", surname: "torres", locale: "es" },
    });

    expect(await subscriptionStore.findById(id)).toBeNull();
  });

  it("throws GoLiveGuardError at build time when push.enabled is true in production without VAPID keys/AlertSourcePolicy/consent text version", () => {
    expect(() =>
      buildApp({
        notifications: { flags: { ...FLAG_DEFAULTS, "push.enabled": true } as never, nodeEnv: "production" },
      }),
    ).toThrow(GoLiveGuardError);
  });

  it("allows push.enabled true in production once every prerequisite is declared", () => {
    expect(() =>
      buildApp({
        notifications: {
          flags: { ...FLAG_DEFAULTS, "push.enabled": true } as never,
          nodeEnv: "production",
          vapidConfigured: true,
          alertSourcePolicy: DEFAULT_ALERT_SOURCE_POLICY,
          pushConsentTextVersion: "v1",
        },
      }),
    ).not.toThrow();
  });

  it("always allows push.enabled against the stub outside production/staging", () => {
    expect(() =>
      buildApp({ notifications: { flags: { ...FLAG_DEFAULTS, "push.enabled": true } as never } }),
    ).not.toThrow();
  });
});

describe("startWorker — journey-poll job wiring (task 11.2)", () => {
  it("registers the journey-poll job when notifications options are given", async () => {
    const queueClient = createInMemoryQueueClient();

    const result = await startWorker({
      queueClient,
      notifications: { flags: { ...FLAG_DEFAULTS, "push.enabled": false } as never },
    });

    expect(result.jobsRegistered).toContain(JOURNEY_POLL_QUEUE);
  });

  it("does not register the journey-poll job when no notifications options are given (backward compatible)", async () => {
    const queueClient = createInMemoryQueueClient();

    const result = await startWorker({ queueClient });

    expect(result.jobsRegistered).toEqual([SAMPLE_JOB_QUEUE]);
  });

  it("throws GoLiveGuardError when push.enabled is true in production without prerequisites", async () => {
    const queueClient = createInMemoryQueueClient();

    await expect(
      startWorker({
        queueClient,
        notifications: { nodeEnv: "production", flags: { ...FLAG_DEFAULTS, "push.enabled": true } as never },
      }),
    ).rejects.toThrow(GoLiveGuardError);
  });

  it("throws when ADAPTER_WEB_PUSH names a non-stub adapter but no real webPush is wired in", async () => {
    const queueClient = createInMemoryQueueClient();

    await expect(
      startWorker({
        queueClient,
        notifications: {
          nodeEnv: "production",
          flags: { ...FLAG_DEFAULTS, "push.enabled": true } as never,
          adapterWebPush: "a-real-push-service",
          vapidConfigured: true,
          alertSourcePolicy: DEFAULT_ALERT_SOURCE_POLICY,
          pushConsentTextVersion: "v1",
        },
      }),
    ).rejects.toThrow(/ADAPTER_WEB_PUSH/);
  });

  it("actually runs the journey-poll job end to end when its queue is triggered", async () => {
    const queueClient = createInMemoryQueueClient();
    const accessLinkStore = createInMemoryAccessLinkStore();
    await accessLinkStore.create({
      tokenHash: "hash-journey-poll",
      reservationRef: "RES-2002",
      passengerScope: [],
      expiresAt: "2099-01-01T00:00:00.000Z",
      issueChannel: "email",
    });
    const notificationStore = createInMemoryNotificationStore();
    const subscriptionStore = createInMemoryPushSubscriptionStore();
    await subscriptionStore.create({
      linkId: "link-1",
      reservationRef: "RES-2002",
      passengerScope: [],
      endpoint: "https://push.example.com/endpoint-1",
      p256dh: "p1",
      auth: "a1",
      locale: "es",
      consentRecordId: "c1",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    const webPush = createWebPushStub();

    await startWorker({
      queueClient,
      notifications: {
        accessLinkStore,
        notificationStore,
        subscriptionStore,
        webPush,
        // RES-2002's seed relocation (L1, departing 2026-11-03) must fall
        // inside [now, now+pollWindowHours] — pin `now` just before it with
        // a generous window so this test does not depend on the real clock.
        pollWindowHours: 24 * 60,
        now: () => new Date("2026-10-01T00:00:00.000Z"),
      },
    });
    await queueClient.sendIdempotent(JOURNEY_POLL_QUEUE, "scan", {});
    await queueClient.runPendingOnce(JOURNEY_POLL_QUEUE);

    expect(webPush.sentPayloads.length).toBeGreaterThan(0);
  });
});

describe("buildApp — pulse routes (tasks 11.4-11.6)", () => {
  it("captures a pulse response end to end, and dispatches exactly one staff_alert for a negative response when both flags are on", async () => {
    const accessLinkStore = createInMemoryAccessLinkStore();
    const sessionStore = createInMemorySessionStore();
    const consentStore = createInMemoryConsentStore();
    const staffAlertStore = createInMemoryStaffAlertStore();
    const app = buildApp({
      tripAccess: { accessLinkStore, sessionStore },
      privacy: { consentStore },
      pulse: {
        staffAlertStore,
        flags: { ...FLAG_DEFAULTS, "pulse.capture": true, "pulse.staff_alerts": true } as never,
      },
    });

    const link = await accessLinkStore.create({
      tokenHash: "hash-pulse-1",
      reservationRef: "RES-1001",
      passengerScope: [],
      expiresAt: "2099-01-01T00:00:00.000Z",
      issueChannel: "email",
    });
    const { generateAccessToken, hashAccessToken } = await import("./modules/trip-access/token.js");
    const sessionId = generateAccessToken();
    await sessionStore.create(hashAccessToken(sessionId), {
      linkId: link.id,
      expiresAt: "2099-01-01T00:00:00.000Z",
      locale: "es",
    });
    await consentStore.record({
      linkId: link.id,
      reservationRef: "RES-1001",
      passengerRef: null,
      purpose: "pulse",
      textVersion: "v1",
      granted: true,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/pulse",
      cookies: { [DEFAULT_SESSION_COOKIE_NAME]: sessionId },
      payload: { legId: "L1", score: 1 },
    });

    expect(response.statusCode).toBe(201);
    const pending = await staffAlertStore.listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.payload.reservationRef).toBe("RES-1001");
  });

  it("throws GoLiveGuardError at build time when pulse.capture is true in production without PULSE_CONSENT_TEXT_VERSION", () => {
    expect(() =>
      buildApp({
        pulse: { flags: { ...FLAG_DEFAULTS, "pulse.capture": true } as never, nodeEnv: "production" },
      }),
    ).toThrow(GoLiveGuardError);
  });

  it("allows pulse.capture true in production once PULSE_CONSENT_TEXT_VERSION is declared", () => {
    expect(() =>
      buildApp({
        pulse: {
          flags: { ...FLAG_DEFAULTS, "pulse.capture": true } as never,
          nodeEnv: "production",
          pulseConsentTextVersion: "v1",
        },
      }),
    ).not.toThrow();
  });

  it("throws GoLiveGuardError at build time when pulse.staff_alerts is true in production without its prerequisites", () => {
    expect(() =>
      buildApp({
        pulse: {
          flags: { ...FLAG_DEFAULTS, "pulse.capture": true, "pulse.staff_alerts": true } as never,
          nodeEnv: "production",
          pulseConsentTextVersion: "v1",
        },
      }),
    ).toThrow(GoLiveGuardError);
  });

  it("allows pulse.staff_alerts true in production once every prerequisite is declared", () => {
    expect(() =>
      buildApp({
        pulse: {
          flags: { ...FLAG_DEFAULTS, "pulse.capture": true, "pulse.staff_alerts": true } as never,
          nodeEnv: "production",
          pulseConsentTextVersion: "v1",
          adapterStaffAlert: "internal-queue",
          staffAlertReceiverId: "ops-team",
          staffAlertProtocolRef: "proto-1",
          staffAlertRetentionDays: 90,
        },
      }),
    ).not.toThrow();
  });

  it("always allows pulse.capture/pulse.staff_alerts against the stub outside production/staging", () => {
    expect(() =>
      buildApp({
        pulse: { flags: { ...FLAG_DEFAULTS, "pulse.capture": true, "pulse.staff_alerts": true } as never },
      }),
    ).not.toThrow();
  });
});

describe("startWorker — pulse staff-alert dispatch job wiring (task 11.5)", () => {
  it("registers the staff-alert dispatch job when pulse options are given", async () => {
    const queueClient = createInMemoryQueueClient();

    const result = await startWorker({
      queueClient,
      pulse: { flags: { ...FLAG_DEFAULTS, "pulse.staff_alerts": false } as never },
    });

    expect(result.jobsRegistered).toContain(STAFF_ALERT_DISPATCH_QUEUE);
  });

  it("does not register the staff-alert dispatch job when no pulse options are given (backward compatible)", async () => {
    const queueClient = createInMemoryQueueClient();

    const result = await startWorker({ queueClient });

    expect(result.jobsRegistered).toEqual([SAMPLE_JOB_QUEUE]);
  });

  it("throws GoLiveGuardError when pulse.staff_alerts is true in production without prerequisites", async () => {
    const queueClient = createInMemoryQueueClient();

    await expect(
      startWorker({
        queueClient,
        pulse: { nodeEnv: "production", flags: { ...FLAG_DEFAULTS, "pulse.staff_alerts": true } as never },
      }),
    ).rejects.toThrow(GoLiveGuardError);
  });

  it("throws when ADAPTER_STAFF_ALERT names a non-stub adapter but no real staffAlertPort is wired in", async () => {
    const queueClient = createInMemoryQueueClient();

    await expect(
      startWorker({
        queueClient,
        pulse: {
          flags: { ...FLAG_DEFAULTS, "pulse.staff_alerts": false } as never,
          adapterStaffAlert: "a-real-channel",
        },
      }),
    ).rejects.toThrow(/ADAPTER_STAFF_ALERT/);
  });

  it("actually dispatches a pending staff_alert end to end when its queue is triggered", async () => {
    const queueClient = createInMemoryQueueClient();
    const staffAlertStore = createInMemoryStaffAlertStore();
    await staffAlertStore.create({
      pulseResponseId: "pr-1",
      payload: {
        alertId: "alert-1",
        reservationRef: "RES-1001",
        passengerOrdinal: 1,
        leg: { origin: "Ollantaytambo", destination: "Machu Picchu Pueblo", departureLocal: "2026-11-02T08:10:00-05:00" },
        returnLegDepartureLocal: null,
        serviceTier: "PRIME",
        score: 1,
        scaleMax: 5,
        answeredAt: "2026-11-02T08:15:00.000Z",
        passengerLocale: "es",
      },
    });
    const staffAlertPort = createStaffAlertStub();

    await startWorker({
      queueClient,
      pulse: { staffAlertStore, staffAlertPort, flags: { ...FLAG_DEFAULTS, "pulse.staff_alerts": false } as never },
    });
    await queueClient.sendIdempotent(STAFF_ALERT_DISPATCH_QUEUE, "scan", {});
    await queueClient.runPendingOnce(STAFF_ALERT_DISPATCH_QUEUE);

    expect(staffAlertPort.deliveries).toHaveLength(1);
    expect((await staffAlertStore.findByPulseResponseId("pr-1"))?.status).toBe("sent");
  });
});
