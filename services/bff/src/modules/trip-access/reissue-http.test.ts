import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import { describe, expect, it } from "vitest";
import { registerTripAccessRoutes } from "./http.js";
import { createInMemoryAccessLinkStore, type AccessLinkStore } from "./access-link-store.js";
import { createInMemorySessionStore } from "./session-store.js";
import { createInMemoryRateLimiter } from "./rate-limiter.js";
import { createLinkDeliveryStub, type LinkDeliveryStub } from "../../adapters/link-delivery/stub.js";
import type { ContactChannel } from "./ports.js";
import type { SirBookingPort } from "../booking/ports.js";
import { createInMemoryPushSubscriptionStore } from "../notifications/push-subscription-store.js";
import type { PushSubscriptionStore } from "../notifications/ports.js";
import { issueAccessLink } from "./issue-link.js";

const CONTACT: ContactChannel = { kind: "email", address: "ana@example.com" };
const NEVER_LIMITED = () => createInMemoryRateLimiter({ max: 1_000_000, windowMs: 60_000 });

function buildSirBookingStub(matches: boolean): Pick<SirBookingPort, "getContactForLinkDelivery"> {
  return {
    async getContactForLinkDelivery(): Promise<ContactChannel | null> {
      return matches ? CONTACT : null;
    },
  };
}

async function buildTestApp(options: {
  matches: boolean;
  reissueRateLimiterMax?: number;
  pushSubscriptionStore?: PushSubscriptionStore;
}): Promise<{ app: FastifyInstance; store: AccessLinkStore; linkDelivery: LinkDeliveryStub }> {
  const app = Fastify();
  await app.register(cookie);
  const store = createInMemoryAccessLinkStore();
  const linkDelivery = createLinkDeliveryStub();

  registerTripAccessRoutes(app, {
    store,
    sessionStore: createInMemorySessionStore(),
    sirBooking: buildSirBookingStub(options.matches),
    linkDelivery,
    internalApiKey: "test-internal-key",
    linkExpiryMs: 72 * 60 * 60 * 1000,
    sessionSlidingMs: 7 * 24 * 60 * 60 * 1000,
    buildLinkUrl: (token: string) => `https://app.travel-hub.local/t#${token}`,
    sessionRateLimiter: NEVER_LIMITED(),
    reissueRateLimiter: options.reissueRateLimiterMax
      ? createInMemoryRateLimiter({ max: options.reissueRateLimiterMax, windowMs: 60_000 })
      : NEVER_LIMITED(),
    ...(options.pushSubscriptionStore ? { pushSubscriptionStore: options.pushSubscriptionStore } : {}),
  });
  await app.ready();

  return { app, store, linkDelivery };
}

describe("POST /api/links/reissue", () => {
  it("returns 202 with a uniform body when the verifier matches", async () => {
    const { app, linkDelivery } = await buildTestApp({ matches: true });

    const response = await app.inject({
      method: "POST",
      url: "/api/links/reissue",
      payload: { reservationRef: "RES-1001", surname: "gomez", locale: "es" },
    });

    expect(response.statusCode).toBe(202);
    expect(linkDelivery.deliveries).toHaveLength(1);
  });

  it("returns the same 202 status and byte-identical body shape when the verifier does not match", async () => {
    const matching = await buildTestApp({ matches: true });
    const nonMatching = await buildTestApp({ matches: false });

    const matchResponse = await matching.app.inject({
      method: "POST",
      url: "/api/links/reissue",
      payload: { reservationRef: "RES-1001", surname: "gomez", locale: "es" },
    });
    const noMatchResponse = await nonMatching.app.inject({
      method: "POST",
      url: "/api/links/reissue",
      payload: { reservationRef: "RES-1001", surname: "wrong", locale: "es" },
    });

    expect(noMatchResponse.statusCode).toBe(matchResponse.statusCode);
    expect(noMatchResponse.body).toBe(matchResponse.body);
    expect(nonMatching.linkDelivery.deliveries).toHaveLength(0);
  });

  it("rejects a malformed request body with 400", async () => {
    const { app } = await buildTestApp({ matches: true });

    const response = await app.inject({
      method: "POST",
      url: "/api/links/reissue",
      payload: { reservationRef: "RES-1001" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("throttles repeated attempts beyond the configured rate limit", async () => {
    const { app } = await buildTestApp({ matches: true, reissueRateLimiterMax: 1 });

    await app.inject({
      method: "POST",
      url: "/api/links/reissue",
      payload: { reservationRef: "RES-1001", surname: "gomez", locale: "es" },
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/links/reissue",
      payload: { reservationRef: "RES-1001", surname: "gomez", locale: "es" },
    });

    expect(second.statusCode).toBe(429);
  });

  it("invalidates the prior link's push subscriptions end to end through the HTTP route (task 11.1 acceptance)", async () => {
    const pushSubscriptionStore = createInMemoryPushSubscriptionStore();
    const { app, store } = await buildTestApp({ matches: true, pushSubscriptionStore });
    const previous = await issueAccessLink(
      { reservationRef: "RES-1001", contact: CONTACT, locale: "es" },
      {
        store,
        linkDelivery: createLinkDeliveryStub(),
        linkExpiryMs: 72 * 60 * 60 * 1000,
        buildLinkUrl: (token: string) => `https://app.travel-hub.local/t#${token}`,
      },
    );
    const subscription = await pushSubscriptionStore.create({
      linkId: previous.accessLinkId,
      reservationRef: "RES-1001",
      passengerScope: [],
      endpoint: "https://push.example.com/endpoint-1",
      p256dh: "p256dh-1",
      auth: "auth-1",
      locale: "es",
      consentRecordId: "consent-1",
      expiresAt: previous.expiresAt,
    });

    await app.inject({
      method: "POST",
      url: "/api/links/reissue",
      payload: { reservationRef: "RES-1001", surname: "gomez", locale: "es" },
    });

    expect(await pushSubscriptionStore.findById(subscription.id)).toBeNull();
  });
});
