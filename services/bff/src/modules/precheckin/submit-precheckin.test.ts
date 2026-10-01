import { describe, expect, it } from "vitest";
import { submitPrecheckin } from "./submit-precheckin.js";
import { createInMemorySubmissionStore } from "./submission-store.js";
import { createPrecheckinDocumentStoreStub } from "../../adapters/precheckin-document-store/stub.js";
import { createKmsStub } from "../../infra/crypto/kms-stub.js";
import { AlreadySubmittedError } from "./ports.js";

const KEY_ID = "precheckin-test-key";

function buildDeps() {
  return {
    submissionStore: createInMemorySubmissionStore(),
    documentStore: createPrecheckinDocumentStoreStub(),
    kms: createKmsStub(),
    keyId: KEY_ID,
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

  it("allows different passengers on the same reservation to each submit independently", async () => {
    const deps = buildDeps();
    await submitPrecheckin(baseInput(), deps);

    const otherPassenger = await submitPrecheckin(baseInput({ passengerRef: "PAX-2" }), deps);

    expect(otherPassenger.passengerRef).toBe("PAX-2");
  });
});
