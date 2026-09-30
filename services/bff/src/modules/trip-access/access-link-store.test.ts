import { describe, expect, it } from "vitest";
import { createInMemoryAccessLinkStore } from "./access-link-store.js";

describe("createInMemoryAccessLinkStore", () => {
  it("creates a record and assigns it a generated id, issuedAt, and revokedAt/supersededBy of null", async () => {
    const store = createInMemoryAccessLinkStore();

    const record = await store.create({
      tokenHash: "hash-1",
      reservationRef: "RES-1001",
      passengerScope: [],
      expiresAt: "2026-11-05T00:00:00.000Z",
      issueChannel: "email",
    });

    expect(record.id).toBeTruthy();
    expect(record.tokenHash).toBe("hash-1");
    expect(record.reservationRef).toBe("RES-1001");
    expect(record.passengerScope).toEqual([]);
    expect(record.expiresAt).toBe("2026-11-05T00:00:00.000Z");
    expect(record.issueChannel).toBe("email");
    expect(record.revokedAt).toBeNull();
    expect(record.supersededBy).toBeNull();
    expect(typeof record.issuedAt).toBe("string");
  });

  it("finds a previously created record by its token hash", async () => {
    const store = createInMemoryAccessLinkStore();
    const created = await store.create({
      tokenHash: "hash-2",
      reservationRef: "RES-2002",
      passengerScope: ["P1"],
      expiresAt: "2026-11-05T00:00:00.000Z",
      issueChannel: "whatsapp",
    });

    const found = await store.findByTokenHash("hash-2");

    expect(found).toEqual(created);
  });

  it("returns null when no record matches the given token hash", async () => {
    const store = createInMemoryAccessLinkStore();

    const found = await store.findByTokenHash("does-not-exist");

    expect(found).toBeNull();
  });

  it("keeps two records for two different reservations independently addressable by their own token hash", async () => {
    const store = createInMemoryAccessLinkStore();
    await store.create({
      tokenHash: "hash-a",
      reservationRef: "RES-1001",
      passengerScope: [],
      expiresAt: "2026-11-05T00:00:00.000Z",
      issueChannel: "email",
    });
    await store.create({
      tokenHash: "hash-b",
      reservationRef: "RES-2002",
      passengerScope: [],
      expiresAt: "2026-11-05T00:00:00.000Z",
      issueChannel: "whatsapp",
    });

    const foundA = await store.findByTokenHash("hash-a");
    const foundB = await store.findByTokenHash("hash-b");

    expect(foundA?.reservationRef).toBe("RES-1001");
    expect(foundB?.reservationRef).toBe("RES-2002");
  });
});
