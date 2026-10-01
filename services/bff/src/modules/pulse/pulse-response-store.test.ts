import { describe, expect, it } from "vitest";
import { createInMemoryPulseResponseStore } from "./pulse-response-store.js";
import { DuplicatePulseResponseError } from "./ports.js";

const INPUT = {
  reservationRef: "RES-1001",
  passengerRef: "P1",
  legRef: "L1",
  score: 2,
  locale: "es" as const,
};

describe("createInMemoryPulseResponseStore", () => {
  it("creates a record with a generated id and answeredAt", async () => {
    const store = createInMemoryPulseResponseStore();

    const record = await store.create(INPUT);

    expect(record.id).toBeTruthy();
    expect(record.reservationRef).toBe("RES-1001");
    expect(record.score).toBe(2);
    expect(typeof record.answeredAt).toBe("string");
  });

  it("finds a record by its composite key", async () => {
    const store = createInMemoryPulseResponseStore();
    const created = await store.create(INPUT);

    expect(await store.findByComposite("RES-1001", "P1", "L1")).toEqual(created);
  });

  it("returns null when no record matches the composite key", async () => {
    const store = createInMemoryPulseResponseStore();

    expect(await store.findByComposite("RES-1001", "P1", "L1")).toBeNull();
  });

  it("REJECTS a second create() for the same (reservationRef, passengerRef, legRef) — this is the unique-index enforcement itself (spec: a second submission is rejected, not double-recorded)", async () => {
    const store = createInMemoryPulseResponseStore();
    await store.create(INPUT);

    await expect(store.create({ ...INPUT, score: 5 })).rejects.toThrow(DuplicatePulseResponseError);

    // Proves the rejection left exactly one row behind, with the FIRST call's score.
    const stored = await store.findByComposite("RES-1001", "P1", "L1");
    expect(stored?.score).toBe(2);
    expect(await store.list()).toHaveLength(1);
  });

  it("allows a different passenger or leg on the same reservation to answer independently", async () => {
    const store = createInMemoryPulseResponseStore();
    await store.create(INPUT);

    await expect(store.create({ ...INPUT, passengerRef: "P2" })).resolves.toMatchObject({ passengerRef: "P2" });
    await expect(store.create({ ...INPUT, legRef: "L2" })).resolves.toMatchObject({ legRef: "L2" });
  });

  it("list() returns every recorded response (task 11.4 reporting/export query)", async () => {
    const store = createInMemoryPulseResponseStore();
    await store.create(INPUT);
    await store.create({ ...INPUT, passengerRef: "P2" });

    expect(await store.list()).toHaveLength(2);
  });
});
