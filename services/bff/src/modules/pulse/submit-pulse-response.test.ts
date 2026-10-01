import { describe, expect, it } from "vitest";
import { submitPulseResponse } from "./submit-pulse-response.js";
import { createInMemoryPulseResponseStore } from "./pulse-response-store.js";
import { createInMemoryStaffAlertStore } from "./staff-alert-store.js";
import { DuplicatePulseResponseError, DuplicateStaffAlertError } from "./ports.js";

const LEG = {
  legRef: "L1",
  origin: "Ollantaytambo",
  destination: "Machu Picchu Pueblo",
  departureLocal: "2026-11-02T08:10:00-05:00",
};

const BASE_INPUT = {
  reservationRef: "RES-1001",
  passengerRef: "P1",
  passengerOrdinal: 1,
  legRef: "L1",
  leg: LEG,
  returnLeg: null,
  serviceTier: "PRIME" as const,
  score: 1,
  scaleMax: 5,
  locale: "es" as const,
  hasReturnLegPending: false,
};

function buildDeps(overrides: { staffAlertsEnabled?: boolean } = {}) {
  return {
    pulseResponseStore: createInMemoryPulseResponseStore(),
    staffAlertStore: createInMemoryStaffAlertStore(),
    negativePulseRule: { scoreThreshold: 2 },
    staffAlertsEnabled: overrides.staffAlertsEnabled ?? true,
  };
}

describe("submitPulseResponse", () => {
  it("records the response and returns it", async () => {
    const deps = buildDeps();

    const result = await submitPulseResponse({ ...BASE_INPUT, score: 5 }, deps);

    expect(result.response.reservationRef).toBe("RES-1001");
    expect(result.response.score).toBe(5);
    expect(result.staffAlertDispatched).toBe(false);
  });

  it("throws DuplicatePulseResponseError on a second submission for the same passenger/leg, without creating a second row (spec: a second attempt is rejected, not double-recorded)", async () => {
    const deps = buildDeps();
    await submitPulseResponse(BASE_INPUT, deps);

    await expect(submitPulseResponse(BASE_INPUT, deps)).rejects.toThrow(DuplicatePulseResponseError);
    expect(await deps.pulseResponseStore.list()).toHaveLength(1);
  });

  it("does NOT create a staff_alert for a non-negative response", async () => {
    const deps = buildDeps();

    const result = await submitPulseResponse({ ...BASE_INPUT, score: 5 }, deps);

    expect(result.staffAlertDispatched).toBe(false);
    expect(await deps.staffAlertStore.findByPulseResponseId(result.response.id)).toBeNull();
  });

  it("creates exactly one staff_alert carrying only StaffAlertPayload fields for a negative response, when pulse.staff_alerts is on (D4a)", async () => {
    const deps = buildDeps({ staffAlertsEnabled: true });

    const result = await submitPulseResponse({ ...BASE_INPUT, score: 1 }, deps);

    expect(result.staffAlertDispatched).toBe(true);
    const alert = await deps.staffAlertStore.findByPulseResponseId(result.response.id);
    expect(alert).not.toBeNull();
    expect(alert?.status).toBe("pending");
    expect(Object.keys(alert!.payload)).toEqual([
      "alertId",
      "reservationRef",
      "passengerOrdinal",
      "leg",
      "returnLegDepartureLocal",
      "serviceTier",
      "score",
      "scaleMax",
      "answeredAt",
      "passengerLocale",
    ]);
    expect(alert?.payload.reservationRef).toBe("RES-1001");
    expect(alert?.payload.passengerOrdinal).toBe(1);
  });

  it("does NOT create a staff_alert for a negative response when pulse.staff_alerts is OFF, while the response is still captured (task 11.5 acceptance)", async () => {
    const deps = buildDeps({ staffAlertsEnabled: false });

    const result = await submitPulseResponse({ ...BASE_INPUT, score: 1 }, deps);

    expect(result.response.score).toBe(1);
    expect(result.staffAlertDispatched).toBe(false);
    expect(await deps.staffAlertStore.findByPulseResponseId(result.response.id)).toBeNull();
  });

  it("never calls StaffAlertPort.send — dispatch is deferred entirely to a separate worker job, so the caller's response never depends on send() outcome (task 11.5: the passenger's HTTP response succeeds regardless of dispatch outcome)", async () => {
    const deps = buildDeps({ staffAlertsEnabled: true });
    // `submitPulseResponse`'s own dependency type has no `staffAlertPort` field
    // at all — this is the structural guarantee; this test documents it via
    // a successful call completing without ever being given a port to call.
    const result = await submitPulseResponse({ ...BASE_INPUT, score: 1 }, deps);

    expect(result.staffAlertDispatched).toBe(true);
  });

  it("stays idempotent under a concurrent retry of the staff-alert creation step for the same pulse response — exactly one staff_alert row survives", async () => {
    const deps = buildDeps({ staffAlertsEnabled: true });
    const result = await submitPulseResponse({ ...BASE_INPUT, score: 1 }, deps);

    // Simulates a retried dispatch-enqueue step re-attempting staff_alert
    // creation for the SAME pulse response (not a new HTTP submission, which
    // would already be rejected at the pulse_response layer).
    await expect(
      deps.staffAlertStore.create({ pulseResponseId: result.response.id, payload: (await deps.staffAlertStore.findByPulseResponseId(result.response.id))!.payload }),
    ).rejects.toThrow(DuplicateStaffAlertError);

    const alerts = await deps.staffAlertStore.listPending();
    expect(alerts).toHaveLength(1);
  });

  it("honors onlyWhenReturnLegPending: a negative score with no pending return leg is not alerted when the rule requires one", async () => {
    const deps = {
      ...buildDeps({ staffAlertsEnabled: true }),
      negativePulseRule: { scoreThreshold: 2, onlyWhenReturnLegPending: true },
    };

    const result = await submitPulseResponse({ ...BASE_INPUT, score: 1, hasReturnLegPending: false }, deps);

    expect(result.staffAlertDispatched).toBe(false);
  });
});
