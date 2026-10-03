import { describe, expect, it } from "vitest";
import { createInMemorySubmissionStore } from "./submission-store.js";
import type { StoredPrecheckinImage } from "./ports.js";

function fakeImage(seed: string): StoredPrecheckinImage {
  return {
    objectKey: `${seed}-key`,
    wrappedDataKey: Buffer.from(`${seed}-wrapped`),
    iv: Buffer.from(`${seed}-iv`),
    authTag: Buffer.from(`${seed}-tag`),
  };
}

describe("createInMemorySubmissionStore", () => {
  it("returns null when no submission exists for a passenger", async () => {
    const store = createInMemorySubmissionStore();

    const result = await store.findByPassenger("RES-1001", "PAX-1");

    expect(result).toBeNull();
  });

  it("creates a submission and makes it findable by the same reservation+passenger", async () => {
    const store = createInMemorySubmissionStore();

    const created = await store.create({
      reservationRef: "RES-1001",
      passengerRef: "PAX-1",
      docType: "DNI",
      consentRecordId: "consent-1",
      photo: fakeImage("photo"),
      idFront: fakeImage("id-front"),
      idBack: null,
    });

    expect(created.id).toEqual(expect.any(String));
    expect(created.submittedAt).toEqual(expect.any(String));

    const found = await store.findByPassenger("RES-1001", "PAX-1");
    expect(found).toEqual(created);
  });

  it("scopes lookups by both reservation and passenger independently", async () => {
    const store = createInMemorySubmissionStore();
    await store.create({
      reservationRef: "RES-1001",
      passengerRef: "PAX-1",
      docType: "PASSPORT",
      consentRecordId: "consent-2",
      photo: fakeImage("photo2"),
      idFront: fakeImage("id-front2"),
      idBack: fakeImage("id-back2"),
    });

    expect(await store.findByPassenger("RES-1001", "PAX-2")).toBeNull();
    expect(await store.findByPassenger("RES-9999", "PAX-1")).toBeNull();
    const found = await store.findByPassenger("RES-1001", "PAX-1");
    expect(found?.docType).toBe("PASSPORT");
    expect(found?.idBack).not.toBeNull();
  });
});
