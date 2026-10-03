import { beforeEach, describe, expect, it } from "vitest";
import type { Locale } from "contracts";
import type { SessionStore } from "./session-store.js";

const T0 = "2026-03-10T12:00:00.000Z";
const FUTURE = "2026-03-17T12:00:00.000Z";

let counter = 0;
/** Opaque stand-in for a SHA-256 hex digest of a session id: never a raw session id, unique per call. */
function idHashMarker(): string {
  counter += 1;
  return `session-hash-marker-${counter.toString(16).padStart(8, "0")}`;
}

export interface SessionStoreHarness {
  /**
   * A store over EMPTY state (the Postgres harness truncates first) whose `createdAt`/`lastSeenAt`
   * are stamped from `now()`, plus a way to obtain a link id the store accepts (Postgres sessions
   * reference a real `access_link` row; in-memory just returns a fresh uuid).
   */
  make(now: () => Date): Promise<{ store: SessionStore; newLinkId(): Promise<string> }>;
}

/**
 * Shared conformance suite for every `SessionStore` implementation (in-memory and
 * Postgres). Only the SHA-256 hash of the session id reaches a store; `expiresAt` is
 * persisted verbatim and never judged by the store (`resolveActiveSession` and
 * `GET /api/session` compare it to their clock, boundary = expired).
 */
export function describeSessionStoreContract(
  name: string,
  harness: SessionStoreHarness,
  options: { skip?: boolean } = {},
): void {
  describe.skipIf(options.skip === true)(`SessionStore contract: ${name}`, () => {
    let store: SessionStore;
    let newLinkId: () => Promise<string>;
    beforeEach(async () => {
      ({ store, newLinkId } = await harness.make(() => new Date(T0)));
    });

    it("creates a session stamped from the clock (createdAt = lastSeenAt) and finds it by id hash", async () => {
      const linkId = await newLinkId();
      const idHash = idHashMarker();

      const created = await store.create(idHash, { linkId, expiresAt: FUTURE, locale: "es" });

      expect(created).toEqual({
        idHash,
        linkId,
        createdAt: T0,
        lastSeenAt: T0,
        expiresAt: FUTURE,
        locale: "es",
        userAgentClass: null,
      });
      expect(await store.findByIdHash(idHash)).toEqual(created);
    });

    it("round-trips every locale, an explicit userAgentClass and millisecond-precision expiresAt", async () => {
      const linkId = await newLinkId();
      for (const locale of ["es", "en", "pt"] as Locale[]) {
        const idHash = idHashMarker();
        await store.create(idHash, {
          linkId,
          expiresAt: "2026-03-17T12:00:00.123Z",
          locale,
          userAgentClass: "mobile-webview",
        });
        const found = await store.findByIdHash(idHash);
        expect(found?.locale).toBe(locale);
        expect(found?.userAgentClass).toBe("mobile-webview");
        expect(found?.expiresAt).toBe("2026-03-17T12:00:00.123Z");
      }
    });

    it("returns null for an unknown id hash", async () => {
      expect(await store.findByIdHash("does-not-exist")).toBeNull();
    });

    it("rejects a second session with the same id hash and leaves the first one intact", async () => {
      const idHash = idHashMarker();
      const first = await store.create(idHash, { linkId: await newLinkId(), expiresAt: FUTURE, locale: "es" });

      await expect(
        store.create(idHash, { linkId: await newLinkId(), expiresAt: "2099-01-01T00:00:00.000Z", locale: "en" }),
      ).rejects.toThrow();

      expect(await store.findByIdHash(idHash)).toEqual(first);
    });

    it("deletes a session by id hash only; deleting an unknown hash is a harmless no-op", async () => {
      const linkId = await newLinkId();
      const gone = idHashMarker();
      const kept = idHashMarker();
      await store.create(gone, { linkId, expiresAt: FUTURE, locale: "es" });
      await store.create(kept, { linkId, expiresAt: FUTURE, locale: "es" });

      await store.deleteByIdHash(gone);
      await expect(store.deleteByIdHash("never-existed")).resolves.toBeUndefined();

      expect(await store.findByIdHash(gone)).toBeNull();
      expect(await store.findByIdHash(kept)).not.toBeNull();
    });

    it("keeps sessions of different links independent and allows several sessions per link", async () => {
      const linkA = await newLinkId();
      const linkB = await newLinkId();
      const a1 = idHashMarker();
      const a2 = idHashMarker();
      const b1 = idHashMarker();
      await store.create(a1, { linkId: linkA, expiresAt: FUTURE, locale: "es" });
      await store.create(a2, { linkId: linkA, expiresAt: FUTURE, locale: "en" });
      await store.create(b1, { linkId: linkB, expiresAt: FUTURE, locale: "pt" });

      expect((await store.findByIdHash(a1))?.linkId).toBe(linkA);
      expect((await store.findByIdHash(a2))?.linkId).toBe(linkA);
      expect((await store.findByIdHash(b1))?.linkId).toBe(linkB);
    });

    it("does not judge expiry: an expired and an exactly-expiring session are returned untouched", async () => {
      const linkId = await newLinkId();
      const expired = idHashMarker();
      const boundary = idHashMarker();
      await store.create(expired, { linkId, expiresAt: "2026-03-01T00:00:00.000Z", locale: "es" });
      await store.create(boundary, { linkId, expiresAt: T0, locale: "es" });

      expect((await store.findByIdHash(expired))?.expiresAt).toBe("2026-03-01T00:00:00.000Z");
      expect((await store.findByIdHash(boundary))?.expiresAt).toBe(T0);
    });

    it("concurrent session exchanges for one link create independent sessions, none lost or overwritten", async () => {
      const linkId = await newLinkId();
      const hashes = Array.from({ length: 10 }, () => idHashMarker());

      await Promise.all(hashes.map((idHash) => store.create(idHash, { linkId, expiresAt: FUTURE, locale: "es" })));

      for (const idHash of hashes) {
        expect((await store.findByIdHash(idHash))?.linkId).toBe(linkId);
      }
    });

    it("concurrent creates of the SAME id hash: exactly one wins and the loser is rejected", async () => {
      const idHash = idHashMarker();
      const linkIds = await Promise.all(Array.from({ length: 6 }, () => newLinkId()));

      const results = await Promise.allSettled(
        linkIds.map((linkId) => store.create(idHash, { linkId, expiresAt: FUTURE, locale: "es" })),
      );

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(5);
      const winner = results.find((r) => r.status === "fulfilled");
      expect((await store.findByIdHash(idHash))?.linkId).toBe(
        winner && winner.status === "fulfilled" ? winner.value.linkId : undefined,
      );
    });
  });
}
