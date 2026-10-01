import { describe, expect, it } from "vitest";
import { createInMemoryPulseResponseStore } from "./pulse-response-store.js";
import { createInMemoryStaffAlertStore } from "./staff-alert-store.js";
import { createInMemoryPiiAccessAudit } from "../../infra/audit/pii-access-audit.js";
import { runPulsePurgeJob } from "./purge-job.js";

const RESPONSE_INPUT = { reservationRef: "RES-1001", passengerRef: "P1", legRef: "L1", score: 2, locale: "es" as const };

describe("runPulsePurgeJob", () => {
  it("purges every pulse_response and staff_alert row past its purgeAfter, leaving others untouched", async () => {
    // A stateful clock lets two `create()` calls on the SAME store produce
    // different `answeredAt`/`purgeAfter` values, so one response can be
    // "due" and another "not yet due" at the same scan time.
    const answeredAtByCall = ["2026-01-01T00:00:00.000Z", "2026-01-02T12:00:00.000Z"];
    let callIndex = 0;
    const pulseResponseStore = createInMemoryPulseResponseStore(
      () => new Date(answeredAtByCall[callIndex++] ?? answeredAtByCall[answeredAtByCall.length - 1]!),
      { retentionDays: 1 },
    );
    const due = await pulseResponseStore.create(RESPONSE_INPUT);
    const stillRetained = await pulseResponseStore.create({ ...RESPONSE_INPUT, passengerRef: "P2" });
    const staffAlertStore = createInMemoryStaffAlertStore(() => new Date(), { retentionDays: 1 });
    const dueAlert = await staffAlertStore.create({
      pulseResponseId: due.id,
      payload: {
        alertId: "alert-1",
        reservationRef: "RES-1001",
        passengerOrdinal: 1,
        leg: { origin: "A", destination: "B", departureLocal: "2026-01-01T00:00:00-05:00" },
        returnLegDepartureLocal: null,
        serviceTier: "PRIME",
        score: 1,
        scaleMax: 5,
        answeredAt: "2026-01-01T00:00:00.000Z",
        passengerLocale: "es",
      },
    });
    const piiAccessAudit = createInMemoryPiiAccessAudit();

    const result = await runPulsePurgeJob({
      pulseResponseStore,
      staffAlertStore,
      piiAccessAudit,
      now: () => new Date("2026-01-03T00:00:00.000Z"),
    });

    expect(result.purgedResponses).toBe(1);
    expect(result.purgedAlerts).toBe(1);
    expect(await pulseResponseStore.findByComposite("RES-1001", "P1", "L1")).toBeNull();
    expect(await pulseResponseStore.findByComposite("RES-1001", "P2", "L1")).toEqual(stillRetained);
    expect(await staffAlertStore.findByPulseResponseId(dueAlert.pulseResponseId)).toBeNull();
    expect(piiAccessAudit.entries.filter((e) => e.subjectType === "pulse_response")).toHaveLength(1);
    expect(piiAccessAudit.entries.filter((e) => e.subjectType === "staff_alert")).toHaveLength(1);
  });

  it("isolates one response's purge failure from another's — a real try/catch per item", async () => {
    const pulseResponseStore = createInMemoryPulseResponseStore(() => new Date("2026-01-01T00:00:00.000Z"), {
      retentionDays: 1,
    });
    const willFail = await pulseResponseStore.create(RESPONSE_INPUT);
    await pulseResponseStore.create({ ...RESPONSE_INPUT, passengerRef: "P2" });
    const staffAlertStore = createInMemoryStaffAlertStore();
    const piiAccessAudit = createInMemoryPiiAccessAudit();
    const failingStore = {
      ...pulseResponseStore,
      async deleteById(id: string) {
        if (id === willFail.id) throw new Error("simulated delete failure");
        return pulseResponseStore.deleteById(id);
      },
    };

    const result = await runPulsePurgeJob({
      pulseResponseStore: failingStore,
      staffAlertStore,
      piiAccessAudit,
      now: () => new Date("2026-01-03T00:00:00.000Z"),
    });

    expect(result.purgedResponses).toBe(1);
    expect(result.failed).toBe(1);
    expect(await pulseResponseStore.findByComposite("RES-1001", "P2", "L1")).toBeNull();
    expect(await pulseResponseStore.findByComposite("RES-1001", "P1", "L1")).toEqual(willFail);
  });

  it("is a no-op when nothing is past its purgeAfter", async () => {
    const pulseResponseStore = createInMemoryPulseResponseStore(() => new Date(), { retentionDays: 90 });
    await pulseResponseStore.create(RESPONSE_INPUT);
    const staffAlertStore = createInMemoryStaffAlertStore();
    const piiAccessAudit = createInMemoryPiiAccessAudit();

    const result = await runPulsePurgeJob({ pulseResponseStore, staffAlertStore, piiAccessAudit });

    expect(result).toEqual({ purgedResponses: 0, purgedAlerts: 0, failed: 0 });
  });
});
