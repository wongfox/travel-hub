import { afterEach, describe, expect, it, vi } from "vitest";
import { runStaffAlertDispatchJob } from "./dispatch-staff-alerts-job.js";
import { createInMemoryStaffAlertStore } from "./staff-alert-store.js";
import type { StaffAlertPort } from "./ports.js";
import { scheduleStaffAlertDispatch, STAFF_ALERT_DISPATCH_QUEUE } from "./dispatch-staff-alerts-job.js";

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

function createFailingStaffAlertPort(failingIds: Set<string>): StaffAlertPort {
  return {
    async send(payload) {
      if (failingIds.has(payload.alertId)) {
        throw new Error(`simulated StaffAlertPort failure for ${payload.alertId}`);
      }
      return { deliveryRef: `delivery-${payload.alertId}` };
    },
  };
}

describe("runStaffAlertDispatchJob", () => {
  it("dispatches every pending staff_alert and marks it sent", async () => {
    const store = createInMemoryStaffAlertStore();
    const alert = await store.create({ pulseResponseId: "pr-1", payload: PAYLOAD });
    const staffAlertPort = createFailingStaffAlertPort(new Set());

    const result = await runStaffAlertDispatchJob({ staffAlertStore: store, staffAlertPort });

    expect(result).toEqual({ processed: 1, dispatched: 1, failed: 0 });
    const updated = await store.findByPulseResponseId("pr-1");
    expect(updated?.id).toBe(alert.id);
    expect(updated?.status).toBe("sent");
    expect(updated?.dispatchedAt).toBeTruthy();
  });

  it("marks a failed dispatch as failed and records the error, without throwing", async () => {
    const store = createInMemoryStaffAlertStore();
    await store.create({ pulseResponseId: "pr-1", payload: PAYLOAD });
    const staffAlertPort = createFailingStaffAlertPort(new Set(["alert-1"]));

    const result = await runStaffAlertDispatchJob({ staffAlertStore: store, staffAlertPort });

    expect(result).toEqual({ processed: 1, dispatched: 0, failed: 1 });
    const updated = await store.findByPulseResponseId("pr-1");
    expect(updated?.status).toBe("failed");
    expect(updated?.attempts).toBe(1);
    expect(updated?.lastError).toContain("simulated StaffAlertPort failure");
  });

  it("isolates one item's dispatch failure from another's — a real try/catch per item, not just a doc comment (learned from prior work units' review findings)", async () => {
    const store = createInMemoryStaffAlertStore();
    await store.create({ pulseResponseId: "pr-failing", payload: { ...PAYLOAD, alertId: "alert-failing" } });
    await store.create({ pulseResponseId: "pr-ok", payload: { ...PAYLOAD, alertId: "alert-ok" } });
    const staffAlertPort = createFailingStaffAlertPort(new Set(["alert-failing"]));

    const result = await runStaffAlertDispatchJob({ staffAlertStore: store, staffAlertPort });

    expect(result).toEqual({ processed: 2, dispatched: 1, failed: 1 });
    expect((await store.findByPulseResponseId("pr-failing"))?.status).toBe("failed");
    expect((await store.findByPulseResponseId("pr-ok"))?.status).toBe("sent");
  });

  it("does not re-dispatch an already-sent alert on a later run", async () => {
    const store = createInMemoryStaffAlertStore();
    await store.create({ pulseResponseId: "pr-1", payload: PAYLOAD });
    const staffAlertPort = createFailingStaffAlertPort(new Set());
    await runStaffAlertDispatchJob({ staffAlertStore: store, staffAlertPort });

    const second = await runStaffAlertDispatchJob({ staffAlertStore: store, staffAlertPort });

    expect(second).toEqual({ processed: 0, dispatched: 0, failed: 0 });
  });
});

describe("scheduleStaffAlertDispatch", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("enqueues an idempotent scan for its queue on every tick, defaults to 60000 ms, and stops when asked", async () => {
    vi.useFakeTimers();
    const sendIdempotent = vi.fn().mockResolvedValue(undefined);

    const stop = scheduleStaffAlertDispatch({ sendIdempotent }, { intervalMs: 1000 });
    expect(sendIdempotent).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(sendIdempotent).toHaveBeenCalledTimes(1);
    expect(sendIdempotent).toHaveBeenCalledWith(STAFF_ALERT_DISPATCH_QUEUE, "scan", {});

    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(sendIdempotent).toHaveBeenCalledTimes(1);

    const stopDefault = scheduleStaffAlertDispatch({ sendIdempotent });
    await vi.advanceTimersByTimeAsync(60000 - 1);
    expect(sendIdempotent).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sendIdempotent).toHaveBeenCalledTimes(2);
    stopDefault();
  });
});
