import { describe, expect, it } from "vitest";
import { getPrecheckinStatusForPassenger } from "./get-precheckin-status.js";
import { createInMemorySubmissionStore } from "./submission-store.js";

describe("getPrecheckinStatusForPassenger", () => {
  it("returns \"none\" when no submission exists for the passenger", async () => {
    const submissionStore = createInMemorySubmissionStore();

    const status = await getPrecheckinStatusForPassenger("RES-1001", "PAX-1", { submissionStore });

    expect(status).toBe("none");
  });

  it("returns \"received\" once a submission has been recorded for that exact passenger", async () => {
    const submissionStore = createInMemorySubmissionStore();
    await submissionStore.create({
      reservationRef: "RES-1001",
      passengerRef: "PAX-1",
      docType: "DNI",
      consentRecordId: "consent-1",
      photo: { objectKey: "k1", wrappedDataKey: Buffer.from("a"), iv: Buffer.from("b"), authTag: Buffer.from("c") },
      idFront: { objectKey: "k2", wrappedDataKey: Buffer.from("a"), iv: Buffer.from("b"), authTag: Buffer.from("c") },
      idBack: null,
    });

    expect(await getPrecheckinStatusForPassenger("RES-1001", "PAX-1", { submissionStore })).toBe("received");
    // A different passenger on the same reservation is unaffected (triangulation on a distinct code path).
    expect(await getPrecheckinStatusForPassenger("RES-1001", "PAX-2", { submissionStore })).toBe("none");
  });
});
