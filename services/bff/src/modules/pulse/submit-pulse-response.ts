import type { Locale, ServiceTier } from "contracts";
import { buildStaffAlertPayload } from "./build-staff-alert-payload.js";
import { evaluateNegativePulseRule, type NegativePulseRule } from "./negative-pulse-rule.js";
import type { PulseResponseRecord, PulseResponseStore, StaffAlertStore } from "./ports.js";

export interface SubmitPulseResponseInput {
  reservationRef: string;
  passengerRef: string;
  passengerOrdinal: number;
  legRef: string;
  leg: { origin: string; destination: string; departureLocal: string };
  /** `null` when the reservation has no return leg (one-way trip). */
  returnLeg: { departureLocal: string } | null;
  serviceTier: ServiceTier;
  score: number;
  scaleMax: number;
  locale: Locale;
  /** Resolved by the caller (the HTTP layer) from the reservation's own legs — this use case has no SIR dependency of its own. */
  hasReturnLegPending: boolean;
}

export interface SubmitPulseResponseDeps {
  pulseResponseStore: Pick<PulseResponseStore, "create">;
  staffAlertStore: Pick<StaffAlertStore, "create">;
  negativePulseRule: NegativePulseRule;
  /** `pulse.staff_alerts` flag value — kept as a plain boolean rather than the full flag table, since this is the only flag this use case reads. */
  staffAlertsEnabled: boolean;
}

export interface SubmitPulseResponseResult {
  response: PulseResponseRecord;
  /** Whether a `staff_alert` row was created for this response (D4a). Never reflects `StaffAlertPort.send`'s outcome — that is a separate worker job (task 11.5's "dispatch outcome recorded"), never called from here. */
  staffAlertDispatched: boolean;
}

/**
 * `POST /api/pulse` use case (task 11.4, D4a alerting task 11.5, design
 * Decision 12): inserts the `pulse_response` (unique per
 * reservation/passenger/leg — `PulseResponseStore.create` throws
 * `DuplicatePulseResponseError` on a repeat), then — IN THE SAME CALL (the
 * in-memory-port-first substitute for "the same transaction") — evaluates
 * the configurable `NegativePulseRule` and, when negative and
 * `pulse.staff_alerts` is on, inserts one `staff_alert` row
 * (`status: "pending"`, unique on `pulseResponseId`).
 *
 * This function NEVER calls `StaffAlertPort.send` — it has no dependency on
 * that port at all. Actual delivery is a separate worker job
 * (`dispatch-staff-alerts-job.ts`) that scans `status: "pending"` rows on its
 * own cadence, so the passenger's HTTP response structurally cannot depend
 * on — or be blocked/failed by — `StaffAlertPort.send`'s outcome (spec:
 * "Passenger-facing pulse submission MUST succeed... regardless of whether
 * staff-alert dispatch succeeds").
 */
export async function submitPulseResponse(
  input: SubmitPulseResponseInput,
  deps: SubmitPulseResponseDeps,
): Promise<SubmitPulseResponseResult> {
  const response = await deps.pulseResponseStore.create({
    reservationRef: input.reservationRef,
    passengerRef: input.passengerRef,
    legRef: input.legRef,
    score: input.score,
    locale: input.locale,
  });

  const isNegative = evaluateNegativePulseRule(
    { score: input.score, hasReturnLegPending: input.hasReturnLegPending },
    deps.negativePulseRule,
  );

  if (!isNegative || !deps.staffAlertsEnabled) {
    return { response, staffAlertDispatched: false };
  }

  const payload = buildStaffAlertPayload({
    alertId: response.id,
    reservationRef: input.reservationRef,
    passengerOrdinal: input.passengerOrdinal,
    leg: input.leg,
    returnLeg: input.returnLeg,
    serviceTier: input.serviceTier,
    score: input.score,
    scaleMax: input.scaleMax,
    answeredAt: response.answeredAt,
    passengerLocale: input.locale,
  });

  await deps.staffAlertStore.create({ pulseResponseId: response.id, payload });

  return { response, staffAlertDispatched: true };
}
