import { describe, expect, it } from "vitest";
import { createInMemoryStaffAlertStore } from "./staff-alert-store.js";
import { DuplicateStaffAlertError } from "./ports.js";

const PAYLOAD = {
  alertId: "alert-1",
  reservationRef: "RES-1001",
  passengerOrdinal: 1,
  leg: { origin: "Ollantaytambo", destination: "Machu Picchu Pueblo", departureLocal: "2026-11-02T08:10:00-05:00" },
  returnLegDepartureLocal: null,
  serviceTier: "PRIME" as const,
  score: 1,
  scaleMax: 5,
  answeredAt: "2026-11-02T08:15:00.000Z",
  passengerLocale: "es" as const,
};

describe("createInMemoryStaffAlertStore", () => {
  it("creates a record with a generated id, status=pending, attempts=0", async () => {
    const store = createInMemoryStaffAlertStore();

    const record = await store.create({ pulseResponseId: "pr-1", payload: PAYLOAD });

    expect(record.id).toBeTruthy();
    expect(record.pulseResponseId).toBe("pr-1");
    expect(record.status).toBe("pending");
    expect(record.attempts).toBe(0);
    expect(record.lastError).toBeNull();
    expect(record.dispatchedAt).toBeNull();
    expect(record.payload).toEqual(PAYLOAD);
  });

  it("finds a record by its pulseResponseId", async () => {
    const store = createInMemoryStaffAlertStore();
    const created = await store.create({ pulseResponseId: "pr-1", payload: PAYLOAD });

    expect(await store.findByPulseResponseId("pr-1")).toEqual(created);
  });

  it("returns null when no record matches the given pulseResponseId", async () => {
    const store = createInMemoryStaffAlertStore();

    expect(await store.findByPulseResponseId("does-not-exist")).toBeNull();
  });

  it("REJECTS a second create() for the same pulseResponseId — this is the idempotent-dispatch guarantee itself (task 11.5 acceptance: exactly one staff_alert row even under a simulated concurrent retry)", async () => {
    const store = createInMemoryStaffAlertStore();
    await store.create({ pulseResponseId: "pr-1", payload: PAYLOAD });

    await expect(
      store.create({ pulseResponseId: "pr-1", payload: { ...PAYLOAD, score: 2 } }),
    ).rejects.toThrow(DuplicateStaffAlertError);

    const stored = await store.findByPulseResponseId("pr-1");
    expect(stored?.payload.score).toBe(1);
  });

  it("stays idempotent under genuinely concurrent create() calls for the same pulseResponseId — exactly one row survives", async () => {
    const store = createInMemoryStaffAlertStore();

    const results = await Promise.allSettled([
      store.create({ pulseResponseId: "pr-concurrent", payload: PAYLOAD }),
      store.create({ pulseResponseId: "pr-concurrent", payload: PAYLOAD }),
      store.create({ pulseResponseId: "pr-concurrent", payload: PAYLOAD }),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(2);
    for (const result of rejected) {
      expect((result as PromiseRejectedResult).reason).toBeInstanceOf(DuplicateStaffAlertError);
    }
  });

  it("listPending() returns only status=pending rows", async () => {
    const store = createInMemoryStaffAlertStore();
    const pending = await store.create({ pulseResponseId: "pr-1", payload: PAYLOAD });
    const sent = await store.create({ pulseResponseId: "pr-2", payload: PAYLOAD });
    await store.updateStatus(sent.id, "sent", { dispatchedAt: "2026-11-02T09:00:00.000Z" });

    const result = await store.listPending();

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(pending.id);
  });

  it("updateStatus sets status/attempts/lastError/dispatchedAt on the targeted record only", async () => {
    const store = createInMemoryStaffAlertStore();
    const target = await store.create({ pulseResponseId: "pr-1", payload: PAYLOAD });
    const other = await store.create({ pulseResponseId: "pr-2", payload: PAYLOAD });

    await store.updateStatus(target.id, "failed", { attempts: 1, lastError: "network timeout" });

    const updated = await store.findByPulseResponseId("pr-1");
    const untouched = await store.findByPulseResponseId("pr-2");
    expect(updated?.status).toBe("failed");
    expect(updated?.attempts).toBe(1);
    expect(updated?.lastError).toBe("network timeout");
    expect(untouched).toEqual(other);
  });

  it("updateStatus on an unknown id is a harmless no-op", async () => {
    const store = createInMemoryStaffAlertStore();

    await expect(store.updateStatus("does-not-exist", "failed")).resolves.toBeUndefined();
  });
});
