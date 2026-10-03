import { beforeEach, describe, expect, it } from "vitest";
import type { AccessLinkStore } from "./access-link-store.js";
import type { SessionStore } from "./session-store.js";
import { createLinkDeliveryStub, type LinkDeliveryStub } from "../../adapters/link-delivery/stub.js";
import { issueAccessLink } from "./issue-link.js";
import { reissueAccessLink } from "./reissue-link.js";
import { exchangeAccessToken, SessionExchangeError } from "./exchange-token.js";
import { resolveActiveSession } from "./session-auth.js";
import { resolveAccessLinkByToken } from "./resolve-link.js";
import { hashAccessToken } from "./token.js";
import type { ContactChannel } from "./ports.js";

const T0 = new Date("2026-03-10T12:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;
const LINK_EXPIRY_MS = 72 * HOUR_MS;
const SESSION_SLIDING_MS = HOUR_MS;
const CONTACT: ContactChannel = { kind: "email", address: "ana@example.com" };

export interface TripAccessFlowHarness {
  /** Stores over EMPTY state, both stamping their rows from `now()`. `dumpStoredText` (Postgres) returns the text of every stored access_link and session row. */
  make(now: () => Date): Promise<{
    accessLinkStore: AccessLinkStore;
    sessionStore: SessionStore;
    dumpStoredText?: () => Promise<string>;
  }>;
}

/**
 * Threat-matrix flow over the REAL use cases (issue, exchange, resolveActiveSession,
 * reissue) on top of any pair of stores: the same assertions the in-memory unit tests
 * make, so a store that breaks them (expired/revoked/unknown token resolving trip
 * data, an old token surviving a reissue, a raw token persisted, a boundary compared
 * wrongly) fails here.
 */
export function describeTripAccessFlow(
  name: string,
  harness: TripAccessFlowHarness,
  options: { skip?: boolean } = {},
): void {
  describe.skipIf(options.skip === true)(`trip-access flow: ${name}`, () => {
    let current: Date;
    let accessLinkStore: AccessLinkStore;
    let sessionStore: SessionStore;
    let dumpStoredText: (() => Promise<string>) | undefined;
    let linkDelivery: LinkDeliveryStub;

    const clock = (): Date => current;
    const deps = () => ({
      store: accessLinkStore,
      linkDelivery,
      linkExpiryMs: LINK_EXPIRY_MS,
      buildLinkUrl: (token: string) => `https://app.travel-hub.local/t#${token}`,
      now: clock,
    });
    const exchange = (token: string, locale?: "es" | "en" | "pt") =>
      exchangeAccessToken(token, locale, { accessLinkStore, sessionStore, sessionSlidingMs: SESSION_SLIDING_MS, now: clock });
    const resolve = (raw: string | undefined) => resolveActiveSession(raw, { accessLinkStore, sessionStore, now: clock });
    /** Issues a link and returns the raw token, as the passenger would get it from the delivery. */
    async function issue(reservationRef: string, passengerScope: string[] = []): Promise<{ token: string; linkId: string }> {
      const before = linkDelivery.deliveries.length;
      const result = await issueAccessLink({ reservationRef, passengerScope, contact: CONTACT, locale: "es" }, deps());
      const delivered = linkDelivery.deliveries[before];
      return { token: delivered!.linkUrl.split("#")[1]!, linkId: result.accessLinkId };
    }
    const reissue = (reservationRef: string) =>
      reissueAccessLink(
        { reservationRef, surname: "gomez", locale: "es" },
        { ...deps(), sirBooking: { getContactForLinkDelivery: async () => CONTACT } },
      );
    async function rejection(promise: Promise<unknown>): Promise<string> {
      try {
        await promise;
      } catch (error) {
        return error instanceof SessionExchangeError ? error.reason : "other";
      }
      return "none";
    }

    beforeEach(async () => {
      current = new Date(T0);
      linkDelivery = createLinkDeliveryStub();
      ({ accessLinkStore, sessionStore, dumpStoredText } = await harness.make(clock));
    });

    it("issue -> exchange -> resolve: the session resolves to its link, scoped to one reservation and its passenger scope, in the requested locale", async () => {
      const mine = await issue("RES-1001", ["P1"]);
      const other = await issue("RES-2002");

      const session = await exchange(mine.token, "en");
      const resolved = await resolve(session.sessionId);

      expect(session.linkId).toBe(mine.linkId);
      expect(resolved?.accessLink.id).toBe(mine.linkId);
      expect(resolved?.accessLink.reservationRef).toBe("RES-1001");
      expect(resolved?.accessLink.passengerScope).toEqual(["P1"]);
      expect(resolved?.locale).toBe("en");
      expect((await resolveAccessLinkByToken(other.token, accessLinkStore))?.reservationRef).toBe("RES-2002");
    });

    it("an unknown or malformed token never creates a session (indistinguishable from an expired link)", async () => {
      await issue("RES-1001");

      expect(await rejection(exchange("not-a-token"))).toBe("link_expired");
      expect(await rejection(exchange("' OR '1'='1"))).toBe("link_expired");
      expect(await rejection(exchange("a".repeat(5000)))).toBe("link_expired");
      expect(await resolve(undefined)).toBeNull();
      expect(await resolve("never-issued")).toBeNull();
    });

    it("link expiry boundary: expired exactly at expiresAt, valid one millisecond before", async () => {
      const { token } = await issue("RES-1001");
      const expiresAtMs = T0.getTime() + LINK_EXPIRY_MS;

      current = new Date(expiresAtMs - 1);
      await expect(exchange(token)).resolves.toBeDefined();
      current = new Date(expiresAtMs);
      expect(await rejection(exchange(token))).toBe("link_expired");
      current = new Date(expiresAtMs + 1);
      expect(await rejection(exchange(token))).toBe("link_expired");
    });

    it("session expiry boundary: expired exactly at expiresAt (min(sliding window, link expiry)), valid one millisecond before", async () => {
      const { token } = await issue("RES-1001");
      const session = await exchange(token);
      expect(session.expiresAt).toBe(new Date(T0.getTime() + SESSION_SLIDING_MS).toISOString());

      current = new Date(T0.getTime() + SESSION_SLIDING_MS - 1);
      expect(await resolve(session.sessionId)).not.toBeNull();
      current = new Date(T0.getTime() + SESSION_SLIDING_MS);
      expect(await resolve(session.sessionId)).toBeNull();
    });

    it("a session never outlives its link: a link expiring sooner than the sliding window caps it", async () => {
      const { token } = await issue("RES-1001");
      current = new Date(T0.getTime() + LINK_EXPIRY_MS - 1000);

      const session = await exchange(token);

      expect(session.expiresAt).toBe(new Date(T0.getTime() + LINK_EXPIRY_MS).toISOString());
    });

    it("reissue invalidates the previous token and its live sessions immediately; the new token works", async () => {
      const first = await issue("RES-1001");
      const liveSession = await exchange(first.token);
      expect(await resolve(liveSession.sessionId)).not.toBeNull();

      await reissue("RES-1001");
      const newToken = linkDelivery.deliveries.at(-1)!.linkUrl.split("#")[1]!;

      expect(await rejection(exchange(first.token))).toBe("link_revoked");
      expect(await resolve(liveSession.sessionId)).toBeNull();
      const fresh = await exchange(newToken);
      expect((await resolve(fresh.sessionId))?.accessLink.reservationRef).toBe("RES-1001");
      expect((await accessLinkStore.findById(first.linkId))?.supersededBy).toBe(fresh.linkId);
    });

    it("reissue for one reservation never touches another reservation's link", async () => {
      const other = await issue("RES-2002");

      await issue("RES-1001");
      await reissue("RES-1001");

      expect((await accessLinkStore.findById(other.linkId))?.revokedAt).toBeNull();
      await expect(exchange(other.token)).resolves.toBeDefined();
    });

    it("concurrent reissues leave exactly one usable link", async () => {
      const first = await issue("RES-1001");

      await Promise.all([reissue("RES-1001"), reissue("RES-1001"), reissue("RES-1001")]);

      const active = await accessLinkStore.findActiveByReservation("RES-1001");
      expect(active).toHaveLength(1);
      expect(active[0]?.id).not.toBe(first.linkId);
      expect(await rejection(exchange(first.token))).toBe("link_revoked");
    });

    it("DELETE session (forget device) ends the session immediately and leaves the link usable", async () => {
      const { token } = await issue("RES-1001");
      const session = await exchange(token);

      await sessionStore.deleteByIdHash(hashAccessToken(session.sessionId));

      expect(await resolve(session.sessionId)).toBeNull();
      await expect(exchange(token)).resolves.toBeDefined();
    });

    it("concurrent exchanges of one token create independent sessions that all resolve", async () => {
      const { token, linkId } = await issue("RES-1001");

      const sessions = await Promise.all(Array.from({ length: 8 }, () => exchange(token)));

      expect(new Set(sessions.map((s) => s.sessionId)).size).toBe(8);
      for (const session of sessions) {
        expect((await resolve(session.sessionId))?.accessLink.id).toBe(linkId);
      }
    });

    it("never persists a raw access token or raw session id: only their SHA-256 hashes are stored", async () => {
      if (!dumpStoredText) return; // asserted on the Postgres harness, which can dump every stored row
      const { token } = await issue("RES-1001");
      const session = await exchange(token);

      const dump = await dumpStoredText();

      expect(dump).not.toContain(token);
      expect(dump).not.toContain(session.sessionId);
      expect(dump).toContain(hashAccessToken(token));
      expect(dump).toContain(hashAccessToken(session.sessionId));
    });
  });
}
