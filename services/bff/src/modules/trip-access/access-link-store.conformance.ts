import { beforeEach, describe, expect, it } from "vitest";
import type { AccessLinkStore, CreateAccessLinkInput } from "./access-link-store.js";

const T0 = "2026-03-10T12:00:00.000Z";
const FUTURE = "2026-03-17T12:00:00.000Z";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNKNOWN_UUID = "00000000-0000-4000-8000-000000000000";

let counter = 0;
/** Opaque stand-in for a SHA-256 hex digest: never a raw token, unique per call. */
function hashMarker(): string {
  counter += 1;
  return `hash-marker-${counter.toString(16).padStart(8, "0")}`;
}

function input(overrides: Partial<CreateAccessLinkInput> = {}): CreateAccessLinkInput {
  return {
    tokenHash: hashMarker(),
    reservationRef: "RES-1001",
    passengerScope: [],
    expiresAt: FUTURE,
    issueChannel: "email",
    ...overrides,
  };
}

export interface AccessLinkStoreHarness {
  /** A store over EMPTY state (the Postgres harness truncates first) whose `issuedAt`/`revokedAt` are stamped from `now()`. */
  make(now: () => Date): Promise<AccessLinkStore>;
}

/**
 * Shared conformance suite for every `AccessLinkStore` implementation
 * (in-memory and Postgres). Only token HASHES ever reach a store; resolution is
 * a lookup by hash. Expiry is deliberately NOT a store concern (use cases
 * compare `expiresAt` to their clock), so the store must hand back expired rows
 * untouched. Reissue invalidation (`supersedeOlderActive`) must converge to one
 * active link even when two reissues race.
 */
export function describeAccessLinkStoreContract(
  name: string,
  harness: AccessLinkStoreHarness,
  options: { skip?: boolean } = {},
): void {
  describe.skipIf(options.skip === true)(`AccessLinkStore contract: ${name}`, () => {
    let store: AccessLinkStore;
    beforeEach(async () => {
      store = await harness.make(() => new Date(T0));
    });

    it("creates a record with a generated uuid, issuedAt from the clock and revokedAt/supersededBy null", async () => {
      const created = await store.create(
        input({ tokenHash: "hash-1", reservationRef: "RES-1001", passengerScope: ["P1", "P2"], issueChannel: "whatsapp" }),
      );

      expect(created.id).toMatch(UUID);
      expect(created.tokenHash).toBe("hash-1");
      expect(created.reservationRef).toBe("RES-1001");
      expect(created.passengerScope).toEqual(["P1", "P2"]);
      expect(created.issueChannel).toBe("whatsapp");
      expect(created.issuedAt).toBe(T0);
      expect(created.expiresAt).toBe(FUTURE);
      expect(created.revokedAt).toBeNull();
      expect(created.supersededBy).toBeNull();
    });

    it("round-trips an empty passengerScope (all passengers) and millisecond-precision expiresAt", async () => {
      const created = await store.create(input({ passengerScope: [], expiresAt: "2026-03-17T12:00:00.123Z" }));

      const found = await store.findById(created.id);
      expect(found?.passengerScope).toEqual([]);
      expect(found?.expiresAt).toBe("2026-03-17T12:00:00.123Z");
    });

    it("finds a created record by its token hash and returns null for an unknown hash", async () => {
      const created = await store.create(input({ tokenHash: "hash-2" }));

      expect(await store.findByTokenHash("hash-2")).toEqual(created);
      expect(await store.findByTokenHash("does-not-exist")).toBeNull();
    });

    it("keeps links for different reservations independently addressable by their own hash", async () => {
      await store.create(input({ tokenHash: "hash-a", reservationRef: "RES-1001" }));
      await store.create(input({ tokenHash: "hash-b", reservationRef: "RES-2002" }));

      expect((await store.findByTokenHash("hash-a"))?.reservationRef).toBe("RES-1001");
      expect((await store.findByTokenHash("hash-b"))?.reservationRef).toBe("RES-2002");
    });

    it("rejects a second link with the same token hash and leaves the first one intact", async () => {
      const first = await store.create(input({ tokenHash: "hash-dup", reservationRef: "RES-1001" }));

      await expect(store.create(input({ tokenHash: "hash-dup", reservationRef: "RES-9999" }))).rejects.toThrow();

      expect(await store.findByTokenHash("hash-dup")).toEqual(first);
    });

    it("finds a record by id; unknown and non-uuid ids resolve to null", async () => {
      const created = await store.create(input());

      expect(await store.findById(created.id)).toEqual(created);
      expect(await store.findById(UNKNOWN_UUID)).toBeNull();
      expect(await store.findById("does-not-exist")).toBeNull();
    });

    it("findActiveByReservation returns only the not-yet-revoked links of that reservation, oldest first", async () => {
      const first = await store.create(input({ reservationRef: "RES-3003" }));
      const second = await store.create(input({ reservationRef: "RES-3003" }));
      const third = await store.create(input({ reservationRef: "RES-3003" }));
      await store.create(input({ reservationRef: "RES-OTHER" }));
      await store.revoke(second.id, third.id);

      const active = await store.findActiveByReservation("RES-3003");

      expect(active.map((link) => link.id)).toEqual([first.id, third.id]);
      expect(await store.findActiveByReservation("RES-UNKNOWN")).toEqual([]);
    });

    it("revoke sets revokedAt (from the clock) and supersededBy on the targeted record only", async () => {
      const target = await store.create(input());
      const newer = await store.create(input());
      const untouched = await store.create(input());

      await store.revoke(target.id, newer.id);

      const revoked = await store.findById(target.id);
      expect(revoked?.revokedAt).toBe(T0);
      expect(revoked?.supersededBy).toBe(newer.id);
      expect(await store.findById(untouched.id)).toEqual(untouched);
      expect(await store.findById(newer.id)).toEqual(newer);
    });

    it("revoking an unknown or non-uuid id is a harmless no-op", async () => {
      const newer = await store.create(input());

      await expect(store.revoke(UNKNOWN_UUID, newer.id)).resolves.toBeUndefined();
      await expect(store.revoke("does-not-exist", newer.id)).resolves.toBeUndefined();
    });

    it("revoking an already revoked link keeps the FIRST revocation (never rewritten)", async () => {
      const target = await store.create(input());
      const firstSuccessor = await store.create(input());
      const secondSuccessor = await store.create(input());

      await store.revoke(target.id, firstSuccessor.id);
      await store.revoke(target.id, secondSuccessor.id);

      expect((await store.findById(target.id))?.supersededBy).toBe(firstSuccessor.id);
    });

    it("listActive returns every not-yet-revoked link across reservations, oldest first, and [] when none", async () => {
      expect(await store.listActive()).toEqual([]);
      const a = await store.create(input({ reservationRef: "RES-9009" }));
      const b = await store.create(input({ reservationRef: "RES-9010" }));
      const revoked = await store.create(input({ reservationRef: "RES-9011" }));
      await store.revoke(revoked.id, a.id);

      expect((await store.listActive()).map((link) => link.id)).toEqual([a.id, b.id]);
    });

    it("does not judge expiry: expired and exactly-expiring links are returned untouched (use cases compare expiresAt to their clock)", async () => {
      const expired = await store.create(input({ expiresAt: "2026-03-01T00:00:00.000Z" }));
      const boundary = await store.create(input({ expiresAt: T0 }));

      expect((await store.findByTokenHash(expired.tokenHash))?.expiresAt).toBe("2026-03-01T00:00:00.000Z");
      expect((await store.findById(boundary.id))?.expiresAt).toBe(T0);
      expect((await store.listActive()).map((link) => link.id)).toEqual([expired.id, boundary.id]);
    });

    describe("supersedeOlderActive (reissue invalidation)", () => {
      it("keeps only the newest active link of the reservation, revoking the others with supersededBy = the newest", async () => {
        const oldest = await store.create(input({ reservationRef: "RES-5005" }));
        const middle = await store.create(input({ reservationRef: "RES-5005" }));
        const newest = await store.create(input({ reservationRef: "RES-5005" }));

        const revoked = await store.supersedeOlderActive("RES-5005");

        expect(revoked.map((link) => link.id)).toEqual([oldest.id, middle.id]);
        for (const link of revoked) {
          expect(link.revokedAt).toBe(T0);
          expect(link.supersededBy).toBe(newest.id);
        }
        expect((await store.findById(oldest.id))?.supersededBy).toBe(newest.id);
        expect((await store.findById(newest.id))?.revokedAt).toBeNull();
        expect((await store.findActiveByReservation("RES-5005")).map((link) => link.id)).toEqual([newest.id]);
      });

      it("invalidates the previous token immediately: its hash still resolves to a record, now revoked", async () => {
        const previous = await store.create(input({ reservationRef: "RES-5006", tokenHash: "hash-previous" }));
        await store.create(input({ reservationRef: "RES-5006", tokenHash: "hash-new" }));

        await store.supersedeOlderActive("RES-5006");

        expect((await store.findByTokenHash("hash-previous"))?.revokedAt).toBe(T0);
        expect((await store.findByTokenHash("hash-new"))?.revokedAt).toBeNull();
        expect(previous.id).not.toBe((await store.findByTokenHash("hash-new"))?.id);
      });

      it("is idempotent, never touches another reservation, and is a no-op without links", async () => {
        await store.create(input({ reservationRef: "RES-5007" }));
        await store.create(input({ reservationRef: "RES-5007" }));
        const other = await store.create(input({ reservationRef: "RES-OTHER" }));

        expect(await store.supersedeOlderActive("RES-5007")).toHaveLength(1);
        expect(await store.supersedeOlderActive("RES-5007")).toEqual([]);
        expect(await store.supersedeOlderActive("RES-NONE")).toEqual([]);
        expect(await store.findById(other.id)).toEqual(other);
      });

      it("does not re-revoke a link that is already revoked (its first supersededBy is kept)", async () => {
        const first = await store.create(input({ reservationRef: "RES-5008" }));
        const second = await store.create(input({ reservationRef: "RES-5008" }));
        await store.revoke(first.id, second.id);
        const third = await store.create(input({ reservationRef: "RES-5008" }));

        const revoked = await store.supersedeOlderActive("RES-5008");

        expect(revoked.map((link) => link.id)).toEqual([second.id]);
        expect((await store.findById(first.id))?.supersededBy).toBe(second.id);
        expect((await store.findById(second.id))?.supersededBy).toBe(third.id);
      });

      it("converges to exactly ONE active link when concurrent reissues race (create + supersede interleaved)", async () => {
        for (let round = 0; round < 5; round += 1) {
          const reservationRef = `RES-RACE-${round}`;
          const original = await store.create(input({ reservationRef }));

          const reissues = await Promise.all(
            Array.from({ length: 6 }, async () => {
              const created = await store.create(input({ reservationRef }));
              const revoked = await store.supersedeOlderActive(reservationRef);
              return { created, revoked };
            }),
          );

          const active = await store.findActiveByReservation(reservationRef);
          expect(active).toHaveLength(1);
          const everyId = [original.id, ...reissues.map((r) => r.created.id)];
          const revokedIds = reissues.flatMap((r) => r.revoked.map((link) => link.id));
          // Each superseded link is revoked by exactly ONE racer (so its push subscriptions are deleted once).
          expect(new Set(revokedIds).size).toBe(revokedIds.length);
          expect([...revokedIds, active[0]!.id].sort()).toEqual([...everyId].sort());
        }
      });
    });
  });
}
