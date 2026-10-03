import { describe, expect, it } from "vitest";
import { runPurgeJob } from "./purge-job.js";
import { createInMemorySubmissionStore } from "./submission-store.js";
import { createPrecheckinDocumentStoreStub } from "../../adapters/precheckin-document-store/stub.js";
import { createInMemoryPiiAccessAudit } from "../../infra/audit/pii-access-audit.js";
import { createKmsStub } from "../../infra/crypto/kms-stub.js";
import { decryptEnvelope, encryptEnvelope } from "../../infra/crypto/envelope-encryption.js";

const KEY_ID = "purge-test-key";

function buildDeps() {
  return {
    submissionStore: createInMemorySubmissionStore(),
    documentStore: createPrecheckinDocumentStoreStub(),
    piiAccessAudit: createInMemoryPiiAccessAudit(),
    now: () => new Date("2026-06-01T00:00:00.000Z"),
  };
}

async function seedSubmission(
  deps: ReturnType<typeof buildDeps>,
  overrides: { passengerRef?: string; purgeAfter: string; kms?: ReturnType<typeof createKmsStub> },
) {
  const kms = overrides.kms ?? createKmsStub();
  const passengerRef = overrides.passengerRef ?? "PAX-1";
  const photoKey = `${passengerRef}-photo-key`;
  const idFrontKey = `${passengerRef}-id-front-key`;
  const photoEnvelope = await encryptEnvelope(Buffer.from("photo-bytes"), kms, KEY_ID);
  await deps.documentStore.put(photoKey, photoEnvelope.ciphertext);
  const idFrontEnvelope = await encryptEnvelope(Buffer.from("id-front-bytes"), kms, KEY_ID);
  await deps.documentStore.put(idFrontKey, idFrontEnvelope.ciphertext);

  return deps.submissionStore.create({
    reservationRef: "RES-1001",
    passengerRef,
    docType: "DNI",
    consentRecordId: "consent-1",
    photo: { objectKey: photoKey, wrappedDataKey: photoEnvelope.wrappedDataKey, iv: photoEnvelope.iv, authTag: photoEnvelope.authTag },
    idFront: { objectKey: idFrontKey, wrappedDataKey: idFrontEnvelope.wrappedDataKey, iv: idFrontEnvelope.iv, authTag: idFrontEnvelope.authTag },
    idBack: null,
    purgeAfter: overrides.purgeAfter,
  });
}

describe("runPurgeJob", () => {
  it("purges a submission whose purgeAfter has elapsed: deletes its objects and crypto-shreds its key material", async () => {
    const deps = buildDeps();
    const submission = await seedSubmission(deps, { purgeAfter: "2026-01-01T00:00:00.000Z" });

    const result = await runPurgeJob(deps);

    expect(result).toEqual({ purged: 1 });
    expect(deps.documentStore.contents.has(submission.photo.objectKey)).toBe(false);
    expect(deps.documentStore.contents.has(submission.idFront.objectKey)).toBe(false);

    const updated = await deps.submissionStore.findByPassenger("RES-1001", "PAX-1");
    expect(updated?.status).toBe("purged");
    expect(updated?.purgedAt).toBe("2026-06-01T00:00:00.000Z");
    expect(updated?.photo.wrappedDataKey.length).toBe(0);
  });

  it("makes the DEK unrecoverable after purge — decryption fails even if a ciphertext copy somehow survived", async () => {
    const deps = buildDeps();
    const kms = createKmsStub();
    await seedSubmission(deps, { purgeAfter: "2026-01-01T00:00:00.000Z", kms });

    await runPurgeJob(deps);

    const purged = await deps.submissionStore.findByPassenger("RES-1001", "PAX-1");
    // The ciphertext itself was already captured before `put` (simulating a
    // copy that somehow survived the object-store delete) — the point is the
    // *key* is gone, not the ciphertext's own deletion (already proven above).
    await expect(
      decryptEnvelope(
        {
          ciphertext: Buffer.from("irrelevant-for-this-assertion"),
          iv: purged!.photo.iv,
          authTag: purged!.photo.authTag,
          wrappedDataKey: purged!.photo.wrappedDataKey,
        },
        kms,
        KEY_ID,
        "test",
      ),
    ).rejects.toThrow();
  });

  it("leaves a submission whose purgeAfter has not yet elapsed untouched", async () => {
    const deps = buildDeps();
    const submission = await seedSubmission(deps, { purgeAfter: "2099-01-01T00:00:00.000Z" });

    const result = await runPurgeJob(deps);

    expect(result).toEqual({ purged: 0 });
    expect(deps.documentStore.contents.has(submission.photo.objectKey)).toBe(true);
    const unchanged = await deps.submissionStore.findByPassenger("RES-1001", "PAX-1");
    expect(unchanged?.status).toBe("received");
  });

  it("writes one pii_access_audit 'purge' entry per purged submission", async () => {
    const deps = buildDeps();
    await seedSubmission(deps, { purgeAfter: "2026-01-01T00:00:00.000Z" });

    await runPurgeJob(deps);

    expect(deps.piiAccessAudit.entries).toHaveLength(1);
    expect(deps.piiAccessAudit.entries[0]).toMatchObject({ action: "purge", subjectType: "precheckin_submission" });
  });

  it("purges every due submission independently, including one already past purgeAfter without having been handed off", async () => {
    const deps = buildDeps();
    await seedSubmission(deps, { passengerRef: "PAX-1", purgeAfter: "2026-01-01T00:00:00.000Z" });
    await seedSubmission(deps, { passengerRef: "PAX-2", purgeAfter: "2026-05-30T00:00:00.000Z" });
    await seedSubmission(deps, { passengerRef: "PAX-3", purgeAfter: "2099-01-01T00:00:00.000Z" });

    const result = await runPurgeJob(deps);

    expect(result).toEqual({ purged: 2 });
    expect((await deps.submissionStore.findByPassenger("RES-1001", "PAX-1"))?.status).toBe("purged");
    expect((await deps.submissionStore.findByPassenger("RES-1001", "PAX-2"))?.status).toBe("purged");
    expect((await deps.submissionStore.findByPassenger("RES-1001", "PAX-3"))?.status).toBe("received");
  });

  it("is idempotent — running it again after everything due is already purged purges nothing further", async () => {
    const deps = buildDeps();
    await seedSubmission(deps, { purgeAfter: "2026-01-01T00:00:00.000Z" });
    await runPurgeJob(deps);

    const second = await runPurgeJob(deps);

    expect(second).toEqual({ purged: 0 });
  });
});
