import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerTripAccessRoutes } from "./http.js";
import { createInMemoryAccessLinkStore } from "./access-link-store.js";
import { createLinkDeliveryStub } from "../../adapters/link-delivery/stub.js";
import { resolveAccessLinkByToken } from "./resolve-link.js";

function buildTestApp() {
  const app = Fastify();
  const store = createInMemoryAccessLinkStore();
  const linkDelivery = createLinkDeliveryStub();
  registerTripAccessRoutes(app, {
    store,
    linkDelivery,
    internalApiKey: "test-internal-key",
    linkExpiryMs: 72 * 60 * 60 * 1000,
    buildLinkUrl: (token) => `https://app.travel-hub.local/t#${token}`,
  });
  return { app, store, linkDelivery };
}

describe("POST /internal/links", () => {
  it("rejects a request with no Authorization header as 401, never issuing a link", async () => {
    const { app, linkDelivery } = buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/internal/links",
      payload: {
        reservationRef: "RES-1001",
        contact: { kind: "email", address: "ana@example.com" },
        locale: "es",
      },
    });

    expect(response.statusCode).toBe(401);
    expect(linkDelivery.deliveries).toHaveLength(0);
  });

  it("rejects a request with the wrong service credential as 401", async () => {
    const { app } = buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/internal/links",
      headers: { authorization: "Bearer wrong-key" },
      payload: {
        reservationRef: "RES-1001",
        contact: { kind: "email", address: "ana@example.com" },
        locale: "es",
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it("rejects a malformed request body as 400", async () => {
    const { app } = buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/internal/links",
      headers: { authorization: "Bearer test-internal-key" },
      payload: { reservationRef: "RES-1001" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("issues a link for a valid, authenticated request and delivers it via LinkDeliveryPort", async () => {
    const { app, linkDelivery, store } = buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/internal/links",
      headers: { authorization: "Bearer test-internal-key" },
      payload: {
        reservationRef: "RES-1001",
        contact: { kind: "email", address: "ana@example.com" },
        locale: "es",
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as { accessLinkId: string; expiresAt: string };
    expect(body.accessLinkId).toBeTruthy();
    expect(linkDelivery.deliveries).toHaveLength(1);
    const token = linkDelivery.deliveries[0]!.linkUrl.split("#")[1]!;
    const record = await resolveAccessLinkByToken(token, store);
    expect(record?.reservationRef).toBe("RES-1001");
    expect(record?.id).toBe(body.accessLinkId);
  });

  it("issues independently scoped links for two different reservations in the same request sequence (no cross-resolution)", async () => {
    const { app, linkDelivery, store } = buildTestApp();

    await app.inject({
      method: "POST",
      url: "/internal/links",
      headers: { authorization: "Bearer test-internal-key" },
      payload: {
        reservationRef: "RES-1001",
        contact: { kind: "email", address: "ana@example.com" },
        locale: "es",
      },
    });
    await app.inject({
      method: "POST",
      url: "/internal/links",
      headers: { authorization: "Bearer test-internal-key" },
      payload: {
        reservationRef: "RES-2002",
        contact: { kind: "whatsapp", address: "+51999888777" },
        locale: "en",
      },
    });

    const [firstToken, secondToken] = linkDelivery.deliveries.map((d) => d.linkUrl.split("#")[1]!);
    const firstRecord = await resolveAccessLinkByToken(firstToken!, store);
    const secondRecord = await resolveAccessLinkByToken(secondToken!, store);

    expect(firstRecord?.reservationRef).toBe("RES-1001");
    expect(secondRecord?.reservationRef).toBe("RES-2002");
  });
});
