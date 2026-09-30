import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { buildApp, startWorker } from "./composition-root.js";
import { createRedactingLogger } from "./infra/logging/redacting-logger.js";
import { createInMemoryQueueClient } from "./infra/queue/queue-client.js";
import { SAMPLE_JOB_QUEUE } from "./infra/queue/sample-job.js";
import { createInMemoryAccessLinkStore } from "./modules/trip-access/access-link-store.js";
import { resolveAccessLinkByToken } from "./modules/trip-access/resolve-link.js";

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
});

describe("startWorker", () => {
  it("starts the given queue client and registers the sample job on it (task 3.4)", async () => {
    const queueClient = createInMemoryQueueClient();

    const result = await startWorker({ queueClient });

    expect(result.jobsRegistered).toEqual([SAMPLE_JOB_QUEUE]);
  });
});
