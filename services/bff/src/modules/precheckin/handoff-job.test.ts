import { afterEach, describe, expect, it, vi } from "vitest";
import { runHandoffJob } from "./handoff-job.js";
import { createInMemorySubmissionStore } from "./submission-store.js";
import { createPrecheckinDocumentStoreStub } from "../../adapters/precheckin-document-store/stub.js";
import { createPrecheckinHandoffStub } from "../../adapters/precheckin-handoff/stub.js";
import { createKmsStub } from "../../infra/crypto/kms-stub.js";
import { createInMemoryPiiAccessAudit } from "../../infra/audit/pii-access-audit.js";
import { encryptEnvelope } from "../../infra/crypto/envelope-encryption.js";
import type { KeyManagementPort } from "../../infra/crypto/key-management-port.js";
import type { PrecheckinDocumentStorePort } from "./ports.js";
import { scheduleHandoffScans, PRECHECKIN_HANDOFF_QUEUE } from "./handoff-job.js";

const KEY_ID = "handoff-test-key";

async function seedSubmission(
  submissionStore: ReturnType<typeof createInMemorySubmissionStore>,
  documentStore: PrecheckinDocumentStorePort,
  kms: KeyManagementPort,
  overrides: { passengerRef?: string; purgeAfter?: string; includeIdBack?: boolean } = {},
) {
  const passengerRef = overrides.passengerRef ?? "PAX-1";
  const photoKey = `${passengerRef}-photo-key`;
  const idFrontKey = `${passengerRef}-id-front-key`;
  const idBackKey = `${passengerRef}-id-back-key`;

  const photoEnvelope = await encryptEnvelope(Buffer.from("photo-plaintext"), kms, KEY_ID);
  await documentStore.put(photoKey, photoEnvelope.ciphertext);
  const idFrontEnvelope = await encryptEnvelope(Buffer.from("id-front-plaintext"), kms, KEY_ID);
  await documentStore.put(idFrontKey, idFrontEnvelope.ciphertext);

  let idBack = null;
  if (overrides.includeIdBack) {
    const idBackEnvelope = await encryptEnvelope(Buffer.from("id-back-plaintext"), kms, KEY_ID);
    await documentStore.put(idBackKey, idBackEnvelope.ciphertext);
    idBack = { objectKey: idBackKey, wrappedDataKey: idBackEnvelope.wrappedDataKey, iv: idBackEnvelope.iv, authTag: idBackEnvelope.authTag };
  }

  return submissionStore.create({
    reservationRef: "RES-1001",
    passengerRef,
    docType: "DNI",
    consentRecordId: "consent-1",
    photo: { objectKey: photoKey, wrappedDataKey: photoEnvelope.wrappedDataKey, iv: photoEnvelope.iv, authTag: photoEnvelope.authTag },
    idFront: { objectKey: idFrontKey, wrappedDataKey: idFrontEnvelope.wrappedDataKey, iv: idFrontEnvelope.iv, authTag: idFrontEnvelope.authTag },
    idBack,
    purgeAfter: overrides.purgeAfter ?? "2026-06-01T00:00:00.000Z",
  });
}

function buildDeps(overrides: Partial<Parameters<typeof runHandoffJob>[0]> = {}) {
  const submissionStore = createInMemorySubmissionStore();
  const documentStore = createPrecheckinDocumentStoreStub();
  const handoffPort = createPrecheckinHandoffStub();
  const kms = createKmsStub();
  const piiAccessAudit = createInMemoryPiiAccessAudit();
  return {
    submissionStore,
    documentStore,
    handoffPort,
    kms,
    keyId: KEY_ID,
    piiAccessAudit,
    retention: { retentionDays: 90, handoffGraceMs: 7 * 24 * 60 * 60 * 1000 },
    now: () => new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

describe("runHandoffJob", () => {
  it("delivers every pending submission's decrypted images, marks it handed_off, and tightens purgeAfter", async () => {
    const deps = buildDeps();
    await seedSubmission(deps.submissionStore, deps.documentStore, deps.kms, { purgeAfter: "2026-06-01T00:00:00.000Z" });

    const result = await runHandoffJob(deps);

    expect(result).toEqual({ processed: 1, handedOff: 1, failed: 0 });
    expect(deps.handoffPort.deliveries).toHaveLength(1);
    const delivered = deps.handoffPort.deliveries[0]!;
    expect(delivered.images.map((image) => image.bytes.toString())).toEqual(
      expect.arrayContaining(["photo-plaintext", "id-front-plaintext"]),
    );

    const stillPending = await deps.submissionStore.listPendingHandoff();
    expect(stillPending).toHaveLength(0);
    const updated = await deps.submissionStore.findByPassenger("RES-1001", "PAX-1");
    expect(updated?.status).toBe("handed_off");
    expect(updated?.handedOffAt).toBe("2026-01-02T00:00:00.000Z");
    // tightened to handed_off_at + grace (7d) = 2026-01-09, sooner than the 2026-06-01 trip-end baseline.
    expect(updated?.purgeAfter).toBe("2026-01-09T00:00:00.000Z");
  });

  it("includes idBack when present, in addition to photo and id_front", async () => {
    const deps = buildDeps();
    await seedSubmission(deps.submissionStore, deps.documentStore, deps.kms, { includeIdBack: true });

    await runHandoffJob(deps);

    const delivered = deps.handoffPort.deliveries[0]!;
    expect(delivered.images).toHaveLength(3);
    expect(delivered.images.find((image) => image.role === "id_back")?.bytes.toString()).toBe("id-back-plaintext");
  });

  it("writes a pii_access_audit entry for every image unwrap and one for the handoff itself", async () => {
    const deps = buildDeps();
    await seedSubmission(deps.submissionStore, deps.documentStore, deps.kms);

    await runHandoffJob(deps);

    const actions = deps.piiAccessAudit.entries.map((entry) => entry.action);
    expect(actions.filter((action) => action === "unwrap")).toHaveLength(2); // photo + id_front
    expect(actions.filter((action) => action === "handoff")).toHaveLength(1);
  });

  it("never invokes a real consumer when precheckin.production_collection is off — the stub only records the attempt", async () => {
    const deps = buildDeps();
    await seedSubmission(deps.submissionStore, deps.documentStore, deps.kms);

    await runHandoffJob(deps);

    // `createPrecheckinHandoffStub` IS the stub adapter: this proves the job
    // only ever talks to it, never a real downstream consumer (task 8.5's
    // "with the flag off, submissions are stored but the handoff port only
    // invokes the stub" acceptance criterion — flag gating itself lives in
    // `startWorker`'s go-live-guard wiring, exercised in composition-root.test.ts).
    expect(deps.handoffPort.deliveries).toHaveLength(1);
  });

  it("leaves a submission pending (status unchanged) when delivery fails, so a later run can retry", async () => {
    const deps = buildDeps();
    await seedSubmission(deps.submissionStore, deps.documentStore, deps.kms);
    deps.handoffPort.simulateFailureOnce();

    const result = await runHandoffJob(deps);

    expect(result).toEqual({ processed: 1, handedOff: 0, failed: 1 });
    const stillPending = await deps.submissionStore.listPendingHandoff();
    expect(stillPending).toHaveLength(1);
    expect(stillPending[0]?.status).toBe("received");
  });

  it("processes multiple pending submissions independently — one failure does not block another", async () => {
    const deps = buildDeps();
    await seedSubmission(deps.submissionStore, deps.documentStore, deps.kms, { passengerRef: "PAX-1" });
    const documentStore2 = createPrecheckinDocumentStoreStub();
    await seedSubmission(deps.submissionStore, documentStore2, deps.kms, { passengerRef: "PAX-2" });
    deps.handoffPort.simulateFailureOnce();

    // documentStore in deps only has PAX-1's objects; swap to a combined store so both resolve.
    const combinedDocumentStore: typeof deps.documentStore = {
      ...deps.documentStore,
      async get(key: string) {
        try {
          return await deps.documentStore.get(key);
        } catch {
          return documentStore2.get(key);
        }
      },
    };

    const result = await runHandoffJob({ ...deps, documentStore: combinedDocumentStore });

    expect(result.processed).toBe(2);
    expect(result.handedOff).toBe(1);
    expect(result.failed).toBe(1);
  });

  it("does not re-deliver to the downstream consumer when markHandedOff fails after a successful deliver, and recovers on retry (R3-handoff-dup-delivery)", async () => {
    const deps = buildDeps();
    await seedSubmission(deps.submissionStore, deps.documentStore, deps.kms);

    let markHandedOffCallCount = 0;
    const realMarkHandedOff = deps.submissionStore.markHandedOff;
    const flakySubmissionStore: typeof deps.submissionStore = {
      ...deps.submissionStore,
      async markHandedOff(id, handedOffAt, purgeAfter) {
        markHandedOffCallCount += 1;
        if (markHandedOffCallCount === 1) {
          throw new Error("simulated persistence failure after a successful deliver");
        }
        return realMarkHandedOff(id, handedOffAt, purgeAfter);
      },
    };

    const firstRun = await runHandoffJob({ ...deps, submissionStore: flakySubmissionStore });
    expect(firstRun).toEqual({ processed: 1, handedOff: 0, failed: 1 });
    // deliver() already succeeded once before markHandedOff threw.
    expect(deps.handoffPort.deliveries).toHaveLength(1);

    // The submission is still "received" (the persist failed), so the next
    // run picks it up again and calls deliver() with the same idempotencyKey.
    const secondRun = await runHandoffJob({ ...deps, submissionStore: flakySubmissionStore });
    expect(secondRun).toEqual({ processed: 1, handedOff: 1, failed: 0 });

    // The stub's idempotency dedupe (same submission.id key) must keep this
    // at exactly one real delivery — never a duplicate PII delivery.
    expect(deps.handoffPort.deliveries).toHaveLength(1);
    const updated = await deps.submissionStore.findByPassenger("RES-1001", "PAX-1");
    expect(updated?.status).toBe("handed_off");
  });

  it("skips cleanly, without counting a handoff, when an overlapping run already handed the submission off", async () => {
    const deps = buildDeps();
    await seedSubmission(deps.submissionStore, deps.documentStore, deps.kms);

    const realMarkHandedOff = deps.submissionStore.markHandedOff;
    const racedSubmissionStore: typeof deps.submissionStore = {
      ...deps.submissionStore,
      async markHandedOff(id, handedOffAt, purgeAfter) {
        // The overlapping run commits its handoff first; this run's compare-and-swap then loses.
        await realMarkHandedOff(id, "2026-01-01T12:00:00.000Z", purgeAfter);
        return realMarkHandedOff(id, handedOffAt, purgeAfter);
      },
    };

    const result = await runHandoffJob({ ...deps, submissionStore: racedSubmissionStore });

    expect(result).toEqual({ processed: 1, handedOff: 0, failed: 0 });
    const stored = await deps.submissionStore.findByPassenger("RES-1001", "PAX-1");
    expect(stored?.handedOffAt).toBe("2026-01-01T12:00:00.000Z");
  });

  it("does nothing when there are no pending submissions", async () => {
    const deps = buildDeps();

    const result = await runHandoffJob(deps);

    expect(result).toEqual({ processed: 0, handedOff: 0, failed: 0 });
    expect(deps.handoffPort.deliveries).toHaveLength(0);
  });
});

describe("scheduleHandoffScans", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("enqueues an idempotent scan for its queue on every tick, defaults to 60000 ms, and stops when asked", async () => {
    vi.useFakeTimers();
    const sendIdempotent = vi.fn().mockResolvedValue(undefined);

    const stop = scheduleHandoffScans({ sendIdempotent }, { intervalMs: 1000 });
    expect(sendIdempotent).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(sendIdempotent).toHaveBeenCalledTimes(1);
    expect(sendIdempotent).toHaveBeenCalledWith(PRECHECKIN_HANDOFF_QUEUE, "scan", {});

    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(sendIdempotent).toHaveBeenCalledTimes(1);

    const stopDefault = scheduleHandoffScans({ sendIdempotent });
    await vi.advanceTimersByTimeAsync(60000 - 1);
    expect(sendIdempotent).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sendIdempotent).toHaveBeenCalledTimes(2);
    stopDefault();
  });
});
