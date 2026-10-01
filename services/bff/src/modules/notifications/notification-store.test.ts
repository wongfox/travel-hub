import { describe, expect, it } from "vitest";
import { createInMemoryNotificationStore } from "./notification-store.js";
import { DuplicateNotificationError } from "./ports.js";

const INPUT = {
  reservationRef: "RES-1001",
  alertType: "RELOCATION" as const,
  sourceEventId: "relocation:LEG-1:2026-10-01T00:00:00.000Z",
  channel: "push" as const,
  dedupeKey: "RELOCATION:RES-1001:relocation:LEG-1:2026-10-01T00:00:00.000Z",
  status: "pending" as const,
};

describe("createInMemoryNotificationStore", () => {
  it("creates a record with a generated id, createdAt, attempts=0, sentAt=null", async () => {
    const store = createInMemoryNotificationStore();

    const record = await store.create(INPUT);

    expect(record.id).toBeTruthy();
    expect(record.dedupeKey).toBe(INPUT.dedupeKey);
    expect(record.status).toBe("pending");
    expect(record.attempts).toBe(0);
    expect(record.sentAt).toBeNull();
    expect(typeof record.createdAt).toBe("string");
  });

  it("finds a record by its dedupeKey", async () => {
    const store = createInMemoryNotificationStore();
    const created = await store.create(INPUT);

    expect(await store.findByDedupeKey(INPUT.dedupeKey)).toEqual(created);
  });

  it("returns null when no record matches the given dedupeKey", async () => {
    const store = createInMemoryNotificationStore();

    expect(await store.findByDedupeKey("does-not-exist")).toBeNull();
  });

  it("REJECTS a second create() with the same dedupeKey — this is the unique-index enforcement itself, not just a parameter the caller can ignore (task 11.2 acceptance: a duplicate event never produces a second notification row)", async () => {
    const store = createInMemoryNotificationStore();
    await store.create(INPUT);

    await expect(store.create({ ...INPUT, channel: "banner" })).rejects.toThrow(DuplicateNotificationError);

    // Proves the rejection actually left exactly one row behind, not a
    // silently-overwritten one with the second call's fields.
    const stored = await store.findByDedupeKey(INPUT.dedupeKey);
    expect(stored?.channel).toBe("push");
  });

  it("allows two different dedupeKeys to coexist", async () => {
    const store = createInMemoryNotificationStore();
    await store.create(INPUT);

    await expect(store.create({ ...INPUT, dedupeKey: "a-different-key" })).resolves.toMatchObject({
      dedupeKey: "a-different-key",
    });
  });

  it("updateStatus updates status and sentAt on the targeted record only", async () => {
    const store = createInMemoryNotificationStore();
    const target = await store.create(INPUT);
    const other = await store.create({ ...INPUT, dedupeKey: "other-key" });

    await store.updateStatus(target.id, "sent", "2026-10-01T01:00:00.000Z");

    const updated = await store.findByDedupeKey(INPUT.dedupeKey);
    const untouched = await store.findByDedupeKey("other-key");
    expect(updated?.status).toBe("sent");
    expect(updated?.sentAt).toBe("2026-10-01T01:00:00.000Z");
    expect(untouched).toEqual(other);
  });

  it("updateStatus on an unknown id is a harmless no-op", async () => {
    const store = createInMemoryNotificationStore();

    await expect(store.updateStatus("does-not-exist", "failed")).resolves.toBeUndefined();
  });
});
