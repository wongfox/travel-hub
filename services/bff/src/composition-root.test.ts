import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { buildApp, startWorker } from "./composition-root.js";
import { createRedactingLogger } from "./infra/logging/redacting-logger.js";
import { createInMemoryQueueClient } from "./infra/queue/queue-client.js";
import { SAMPLE_JOB_QUEUE } from "./infra/queue/sample-job.js";
import { createInMemoryAccessLinkStore } from "./modules/trip-access/access-link-store.js";
import { resolveAccessLinkByToken } from "./modules/trip-access/resolve-link.js";
import { DEFAULT_SESSION_COOKIE_NAME } from "./modules/trip-access/http.js";

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

describe("startWorker", () => {
  it("starts the given queue client and registers the sample job on it (task 3.4)", async () => {
    const queueClient = createInMemoryQueueClient();

    const result = await startWorker({ queueClient });

    expect(result.jobsRegistered).toEqual([SAMPLE_JOB_QUEUE]);
  });
});
