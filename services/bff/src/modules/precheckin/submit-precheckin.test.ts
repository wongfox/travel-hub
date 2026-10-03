import { describe, expect, it } from "vitest";
import { submitPrecheckin } from "./submit-precheckin.js";
import { createInMemorySubmissionStore } from "./submission-store.js";
import { createPrecheckinDocumentStoreStub } from "../../adapters/precheckin-document-store/stub.js";
import { createKmsStub } from "../../infra/crypto/kms-stub.js";
import { AlreadySubmittedError, type PrecheckinDocumentStorePort } from "./ports.js";
import { computeInitialPurgeAfter, type RetentionConfig } from "./retention.js";

/** Wraps a real stub so the Nth `put` call rejects, to test partial-failure cleanup. */
function failPutOnCall(
  documentStore: PrecheckinDocumentStorePort & { contents: Map<string, Buffer> },
  failOnCallNumber: number,
): PrecheckinDocumentStorePort & { contents: Map<string, Buffer> } {
  let callCount = 0;
  return {
    contents: documentStore.contents,
    async put(key, ciphertext) {
      callCount += 1;
      if (callCount === failOnCallNumber) {
        throw new Error("simulated put failure on call " + String(callCount));
      }
      await documentStore.put(key, ciphertext);
    },
    async delete(key) {
      await documentStore.delete(key);
    },
  };
}

const KEY_ID = "precheckin-test-key";
const TRIP_END_LOCAL = "2026-01-10T18:00:00.000Z";
const RETENTION: RetentionConfig = { retentionDays: 90, handoffGraceMs: 7 * 24 * 60 * 60 * 1000 };

function buildDeps() {
  return {
    submissionStore: createInMemorySubmissionStore(),
    documentStore: createPrecheckinDocumentStoreStub(),
    kms: createKmsStub(),
    keyId: KEY_ID,
    tripEndLocal: TRIP_END_LOCAL,
    retention: RETENTION,
  };
}

function baseInput(overrides: Partial<Parameters<typeof submitPrecheckin>[0]> = {}) {
  return {
    reservationRef: "RES-1001",
    passengerRef: "PAX-1",
    docType: "DNI" as const,
    consentRecordId: "consent-1",
    images: [
      { role: "photo" as const, contentType: "image/jpeg", bytes: Buffer.from("photo-bytes") },
      { role: "id_front" as const, contentType: "image/jpeg", bytes: Buffer.from("id-front-bytes") },
    ],
    ...overrides,
  };
}

describe("submitPrecheckin", () => {
  it("encrypts and stores each image, then persists a submission record", async () => {
    const deps = buildDeps();

    const record = await submitPrecheckin(baseInput(), deps);

    expect(record.reservationRef).toBe("RES-1001");
    expect(record.passengerRef).toBe("PAX-1");
    expect(record.idBack).toBeNull();
    // The stored bytes must never equal the plaintext — proves encryption actually ran.
    const storedPhotoCiphertext = deps.documentStore.contents.get(record.photo.objectKey);
    expect(storedPhotoCiphertext).toBeDefined();
    expect(storedPhotoCiphertext?.equals(Buffer.from("photo-bytes"))).toBe(false);
  });

  it("includes idBack when a third image is provided (triangulation)", async () => {
    const deps = buildDeps();

    const record = await submitPrecheckin(
      baseInput({
        images: [
          { role: "photo", contentType: "image/jpeg", bytes: Buffer.from("photo-2") },
          { role: "id_front", contentType: "image/jpeg", bytes: Buffer.from("id-front-2") },
          { role: "id_back", contentType: "image/jpeg", bytes: Buffer.from("id-back-2") },
        ],
      }),
      deps,
    );

    expect(record.idBack).not.toBeNull();
    expect(record.idBack?.objectKey).not.toBe(record.photo.objectKey);
    expect(record.idBack?.objectKey).not.toBe(record.idFront.objectKey);
  });

  it("a successful submission's ciphertext is unreadable without the wrapped DEK", async () => {
    const deps = buildDeps();

    const record = await submitPrecheckin(baseInput(), deps);
    const rawCiphertext = deps.documentStore.contents.get(record.photo.objectKey);

    // Attempting to unwrap with a tampered wrapped key must fail — the plaintext DEK is never derivable from ciphertext alone.
    await expect(deps.kms.unwrap(Buffer.from("not-a-real-wrapped-key"), KEY_ID, "test")).rejects.toThrow();
    expect(rawCiphertext?.includes(Buffer.from("photo-bytes"))).toBe(false);
  });

  it("rejects a second submission for the same passenger with AlreadySubmittedError", async () => {
    const deps = buildDeps();
    await submitPrecheckin(baseInput(), deps);

    await expect(submitPrecheckin(baseInput(), deps)).rejects.toBeInstanceOf(AlreadySubmittedError);
  });

  it("deletes the ciphertext it just stored when it loses a concurrent race for the same passenger, leaving only the winner's objects", async () => {
    const deps = buildDeps();

    const results = await Promise.allSettled([submitPrecheckin(baseInput(), deps), submitPrecheckin(baseInput(), deps)]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const loser = results.find((r) => r.status === "rejected");
    expect(loser && "reason" in loser ? loser.reason : undefined).toBeInstanceOf(AlreadySubmittedError);
    // photo + id_front of the winner only: the loser's two ciphertexts must not be orphaned.
    expect(deps.documentStore.contents.size).toBe(2);
  });

  it("does not persist a submission record when document storage fails, so retry is allowed without re-consenting", async () => {
    const deps = buildDeps();
    deps.documentStore.simulatePutFailureOnce();

    await expect(submitPrecheckin(baseInput(), deps)).rejects.toThrow(/simulated/);

    const existing = await deps.submissionStore.findByPassenger("RES-1001", "PAX-1");
    expect(existing).toBeNull();

    // Retry succeeds — no re-consent needed at this layer (consent is checked by the HTTP route, not this use case).
    const record = await submitPrecheckin(baseInput(), deps);
    expect(record.reservationRef).toBe("RES-1001");
  });

  it("deletes the already-stored photo ciphertext when the id_front upload fails afterward, leaving no orphan", async () => {
    const realDocumentStore = createPrecheckinDocumentStoreStub();
    const deps = {
      submissionStore: createInMemorySubmissionStore(),
      documentStore: failPutOnCall(realDocumentStore, 2),
      kms: createKmsStub(),
      keyId: KEY_ID,
      tripEndLocal: TRIP_END_LOCAL,
      retention: RETENTION,
    };

    await expect(submitPrecheckin(baseInput(), deps)).rejects.toThrow(/simulated put failure/);

    // The photo's `put` (call 1) succeeded before id_front's `put` (call 2) failed;
    // the orphaned photo ciphertext must be cleaned up, not left stranded forever.
    expect(realDocumentStore.contents.size).toBe(0);
  });

  describe("when submissionStore.create fails for a reason other than a confirmed duplicate", () => {
    const CREATE_FAILURE = new Error("simulated connection reset");

    type Store = ReturnType<typeof createInMemorySubmissionStore>;

    /** `create` throws `error` (optionally AFTER really inserting the row: a commit whose ack was lost); `findByPassenger` can fail from its Nth call on. */
    function faultyStore(
      real: Store,
      options: { commitBeforeThrow?: boolean; failLookupFromCall?: number; error?: Error },
    ): Store {
      let lookups = 0;
      return {
        ...real,
        async findByPassenger(reservationRef, passengerRef) {
          lookups += 1;
          if (options.failLookupFromCall !== undefined && lookups >= options.failLookupFromCall) {
            throw new Error("simulated lookup failure");
          }
          return real.findByPassenger(reservationRef, passengerRef);
        },
        async create(input) {
          if (options.commitBeforeThrow) await real.create(input);
          throw options.error ?? CREATE_FAILURE;
        },
      };
    }

    it("deletes the just-uploaded objects when no row references them (plain failure), and rethrows the original error", async () => {
      const deps = buildDeps();
      const submissionStore = faultyStore(deps.submissionStore, {});

      await expect(submitPrecheckin(baseInput(), { ...deps, submissionStore })).rejects.toBe(CREATE_FAILURE);

      expect(deps.documentStore.contents.size).toBe(0);
      expect(await deps.submissionStore.findByPassenger("RES-1001", "PAX-1")).toBeNull();
    });

    it("KEEPS the objects when the failed create actually committed a row that references them (lost ack), and rethrows the original error", async () => {
      const deps = buildDeps();
      const submissionStore = faultyStore(deps.submissionStore, { commitBeforeThrow: true });

      await expect(submitPrecheckin(baseInput(), { ...deps, submissionStore })).rejects.toBe(CREATE_FAILURE);

      const row = await deps.submissionStore.findByPassenger("RES-1001", "PAX-1");
      expect(row).not.toBeNull();
      // No dangling reference: every object key the row points at is still in the document store.
      expect(deps.documentStore.contents.has(row!.photo.objectKey)).toBe(true);
      expect(deps.documentStore.contents.has(row!.idFront.objectKey)).toBe(true);
      expect(deps.documentStore.contents.size).toBe(2);
    });

    it("KEEPS the objects when the lookup itself fails (state unknown), and rethrows the ORIGINAL create error, not the lookup error", async () => {
      const deps = buildDeps();
      // call 1 is the use case's own up-front duplicate check; the cleanup lookup is call 2.
      const submissionStore = faultyStore(deps.submissionStore, { failLookupFromCall: 2 });

      await expect(submitPrecheckin(baseInput(), { ...deps, submissionStore })).rejects.toBe(CREATE_FAILURE);

      expect(deps.documentStore.contents.size).toBe(2);
    });

    it("deletes our objects when the row found belongs to someone else's keys (not referenced by it)", async () => {
      const deps = buildDeps();
      const other = createInMemorySubmissionStore();
      const winner = await submitPrecheckin(baseInput(), { ...deps, submissionStore: other });
      // `create` fails (e.g. a CHECK/timeout) while the up-front duplicate check had seen nothing; the lookup now
      // returns the winner's row, which references the winner's keys, not ours.
      let lookups = 0;
      const submissionStore: Store = {
        ...other,
        async findByPassenger(reservationRef, passengerRef) {
          lookups += 1;
          return lookups === 1 ? null : other.findByPassenger(reservationRef, passengerRef);
        },
        async create() {
          throw CREATE_FAILURE;
        },
      };

      await expect(submitPrecheckin(baseInput(), { ...deps, submissionStore })).rejects.toBe(CREATE_FAILURE);

      expect([...deps.documentStore.contents.keys()].sort()).toEqual([winner.idFront.objectKey, winner.photo.objectKey].sort());
    });

    it("keeps the original duplicate behavior: AlreadySubmittedError deletes the loser's objects without consulting the store", async () => {
      const deps = buildDeps();
      const submissionStore = faultyStore(deps.submissionStore, {
        error: new AlreadySubmittedError("RES-1001", "PAX-1"),
        failLookupFromCall: 2,
      });

      await expect(submitPrecheckin(baseInput(), { ...deps, submissionStore })).rejects.toBeInstanceOf(AlreadySubmittedError);

      expect(deps.documentStore.contents.size).toBe(0);
    });

    it("isolates each delete: one failing delete neither stops the others nor masks the original error", async () => {
      const real = createPrecheckinDocumentStoreStub();
      let failedKey: string | undefined;
      const documentStore = {
        contents: real.contents,
        put: real.put.bind(real),
        async delete(key: string) {
          if (failedKey === undefined) {
            failedKey = key;
            throw new Error("simulated delete failure");
          }
          await real.delete(key);
        },
      };
      const deps = { ...buildDeps(), documentStore };
      const submissionStore = faultyStore(deps.submissionStore, {});

      await expect(submitPrecheckin(baseInput(), { ...deps, submissionStore })).rejects.toBe(CREATE_FAILURE);

      // 2 objects were uploaded; exactly the one whose delete failed remains.
      expect([...real.contents.keys()]).toEqual([failedKey]);
    });
  });

  it("computes purgeAfter from tripEndLocal + retention and starts status as 'received' (task 8.5)", async () => {
    const deps = buildDeps();

    const record = await submitPrecheckin(baseInput(), deps);

    expect(record.status).toBe("received");
    expect(record.handedOffAt).toBeNull();
    expect(record.purgedAt).toBeNull();
    expect(record.purgeAfter).toBe(computeInitialPurgeAfter(TRIP_END_LOCAL, RETENTION));
  });

  it("allows different passengers on the same reservation to each submit independently", async () => {
    const deps = buildDeps();
    await submitPrecheckin(baseInput(), deps);

    const otherPassenger = await submitPrecheckin(baseInput({ passengerRef: "PAX-2" }), deps);

    expect(otherPassenger.passengerRef).toBe("PAX-2");
  });
});
