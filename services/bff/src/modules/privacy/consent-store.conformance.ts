import { beforeEach, describe, expect, it } from "vitest";
import type { ConsentStore, RecordConsentInput } from "./consent-store.js";

const LINK_ID = "11111111-1111-4111-8111-111111111111";

const BASE: Omit<RecordConsentInput, "purpose" | "granted"> = {
  linkId: LINK_ID,
  reservationRef: "RES-1001",
  passengerRef: null,
  textVersion: "v1",
};

export interface ConsentStoreHarness {
  /** A store over EMPTY state (the Postgres harness truncates first). */
  make(): Promise<ConsentStore>;
}

/**
 * Shared conformance suite for every `ConsentStore` implementation
 * (in-memory and Postgres): append-only records, latest-per-purpose wins,
 * and the per-reservation `listLatestByPurpose` the analytics forward job
 * re-checks consent with.
 */
export function describeConsentStoreContract(
  name: string,
  harness: ConsentStoreHarness,
  options: { skip?: boolean } = {},
): void {
  describe.skipIf(options.skip === true)(`ConsentStore contract: ${name}`, () => {
    let store: ConsentStore;
    beforeEach(async () => {
      store = await harness.make();
    });

    it("returns null when no consent has ever been recorded for a purpose", async () => {
      expect(await store.findLatest("RES-1001", null, "precheckin_biometric")).toBeNull();
    });

    it("records a consent with a generated id and ISO recordedAt and returns it as the latest", async () => {
      const recorded = await store.record({ ...BASE, purpose: "precheckin_biometric", granted: true });

      expect(recorded).toMatchObject({
        linkId: LINK_ID,
        reservationRef: "RES-1001",
        passengerRef: null,
        purpose: "precheckin_biometric",
        textVersion: "v1",
        granted: true,
      });
      expect(recorded.id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(new Date(recorded.recordedAt).toISOString()).toBe(recorded.recordedAt);
      expect(await store.findLatest("RES-1001", null, "precheckin_biometric")).toEqual(recorded);
    });

    it("is append-only: a withdrawal is a new row with its own id, and the grant stays recorded", async () => {
      const granted = await store.record({ ...BASE, purpose: "pulse", granted: true });
      const withdrawn = await store.record({ ...BASE, purpose: "pulse", granted: false });

      expect(withdrawn.id).not.toBe(granted.id);
      expect((await store.findLatest("RES-1001", null, "pulse"))?.granted).toBe(false);
    });

    it("latest wins in both directions: a re-grant after a withdrawal is the latest", async () => {
      await store.record({ ...BASE, purpose: "analytics", granted: false, textVersion: "v1" });
      const second = await store.record({ ...BASE, purpose: "analytics", granted: true, textVersion: "v2" });

      expect(await store.findLatest("RES-1001", null, "analytics")).toEqual(second);

      const third = await store.record({ ...BASE, purpose: "analytics", granted: false, textVersion: "v2" });
      expect(await store.findLatest("RES-1001", null, "analytics")).toEqual(third);
    });

    it("resolves records written back to back (same clock tick) by insertion order", async () => {
      let last = null;
      for (let index = 0; index < 25; index += 1) {
        last = await store.record({ ...BASE, purpose: "analytics", granted: index % 2 === 0 });
      }

      expect((await store.findLatest("RES-1001", null, "analytics"))?.id).toBe(last?.id);
      const [only, ...rest] = await store.listLatestByPurpose("analytics");
      expect(rest).toEqual([]);
      expect(only?.id).toBe(last?.id);
    });

    it("scopes lookups independently per reservation, passengerRef and purpose", async () => {
      await store.record({ ...BASE, purpose: "precheckin_biometric", granted: true });
      await store.record({ ...BASE, passengerRef: "PAX-1", purpose: "precheckin_biometric", granted: false });

      expect(await store.findLatest("RES-2002", null, "precheckin_biometric")).toBeNull();
      expect(await store.findLatest("RES-1001", "PAX-2", "precheckin_biometric")).toBeNull();
      expect(await store.findLatest("RES-1001", null, "push")).toBeNull();
      expect((await store.findLatest("RES-1001", null, "precheckin_biometric"))?.granted).toBe(true);
      expect((await store.findLatest("RES-1001", "PAX-1", "precheckin_biometric"))?.granted).toBe(false);
    });

    it("listLatestByPurpose returns the latest reservation-scope record per reservation for that purpose only", async () => {
      await store.record({ ...BASE, reservationRef: "RES-1", purpose: "analytics", granted: true });
      await store.record({ ...BASE, reservationRef: "RES-1", purpose: "analytics", granted: false });
      await store.record({ ...BASE, reservationRef: "RES-2", purpose: "analytics", granted: true });
      await store.record({ ...BASE, reservationRef: "RES-3", purpose: "push", granted: true });
      await store.record({ ...BASE, reservationRef: "RES-4", passengerRef: "PAX-1", purpose: "analytics", granted: true });

      const latest = await store.listLatestByPurpose("analytics");

      expect(latest.map((record) => [record.reservationRef, record.granted]).sort()).toEqual([
        ["RES-1", false],
        ["RES-2", true],
      ]);
      expect(await store.listLatestByPurpose("pulse")).toEqual([]);
    });

    it("keeps every concurrent record: unique ids, one latest per reservation", async () => {
      const recorded = await Promise.all(
        Array.from({ length: 10 }, (_, index) =>
          store.record({ ...BASE, purpose: "analytics", granted: index % 2 === 0 }),
        ),
      );

      expect(new Set(recorded.map((record) => record.id)).size).toBe(10);
      const latest = await store.listLatestByPurpose("analytics");
      expect(latest).toHaveLength(1);
      expect(recorded.map((record) => record.id)).toContain(latest[0]?.id);
      expect((await store.findLatest("RES-1001", null, "analytics"))?.id).toBe(latest[0]?.id);
    });
  });
}
