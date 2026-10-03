import { StaffAlertPayloadSchema, type Locale, type ServiceTier, type StaffAlertPayload } from "contracts";

export interface BuildStaffAlertPayloadInput {
  alertId: string;
  reservationRef: string;
  passengerOrdinal: number;
  leg: { origin: string; destination: string; departureLocal: string };
  /** `null` when the reservation has no return leg (one-way trip). */
  returnLeg: { departureLocal: string } | null;
  serviceTier: ServiceTier;
  score: number;
  scaleMax: number;
  answeredAt: string;
  passengerLocale: Locale;
}

/**
 * Builds the D4a `StaffAlertPayload` (task 11.5, design Decision 12): names
 * every field explicitly (no spread of a larger passenger/reservation
 * object), then validates the result against the `.strict()`
 * `StaffAlertPayloadSchema` — the schema itself is the enforcement that no
 * passenger name, email, phone, document number, or free text can ever reach
 * a staff alert, not just this function's own discipline.
 */
export function buildStaffAlertPayload(input: BuildStaffAlertPayloadInput): StaffAlertPayload {
  return StaffAlertPayloadSchema.parse({
    alertId: input.alertId,
    reservationRef: input.reservationRef,
    passengerOrdinal: input.passengerOrdinal,
    leg: {
      origin: input.leg.origin,
      destination: input.leg.destination,
      departureLocal: input.leg.departureLocal,
    },
    returnLegDepartureLocal: input.returnLeg ? input.returnLeg.departureLocal : null,
    serviceTier: input.serviceTier,
    score: input.score,
    scaleMax: input.scaleMax,
    answeredAt: input.answeredAt,
    passengerLocale: input.passengerLocale,
  });
}
