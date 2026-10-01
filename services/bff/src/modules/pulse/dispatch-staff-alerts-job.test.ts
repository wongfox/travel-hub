import { describe, expect, it } from "vitest";
import { runStaffAlertDispatchJob } from "./dispatch-staff-alerts-job.js";
import { createInMemoryStaffAlertStore } from "./staff-alert-store.js";
import type { StaffAlertPort } from "./ports.js";

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
