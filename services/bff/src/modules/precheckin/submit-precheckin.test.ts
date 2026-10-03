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
