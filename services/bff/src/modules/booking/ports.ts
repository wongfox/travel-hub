import type { LegStatus, ServiceTier } from "contracts";
import type { ContactChannel } from "../trip-access/ports.js";

/**
 * `booking-data-integration` domain types + `SirBookingPort` (design-interfaces).
 * These are the BFF's own normalized shapes, deliberately distinct from
 * whatever raw shape a real SIR adapter receives — the anti-corruption
 * mapping layer (see `adapters/sir-booking/mapper.ts`) is the only place
 * allowed to know about a raw adapter's field names.
 */
export interface ReservationRef {
  reservationRef: string;
}

export interface SirPassenger {
  passengerRef: string;
  ordinal: number;
  displayName: string;
}

export interface SirLeg {
  legRef: string;
  origin: string;
  destination: string;
  departureLocal: string;
  arrivalLocal: string;
  tier: ServiceTier;
  status: LegStatus;
}

export interface SirReservation {
  reservationRef: string;
  passengers: SirPassenger[];
  legs: SirLeg[];
  contact: ContactChannel;
}

export interface SirRelocation {
  legRef: string;
  recordedAt: string;
  reason?: string;
  newSeat?: string;
}

/**
 * Identifying input used to confirm a re-request actually belongs to the
 * reservation it names, before revealing (or delivering to) its contact
 * channel. Spec `trip-link-access`'s re-request scenario names the exact
 * input set as TBD and suggests "reservation code plus surname" as an
 * example; this design picks that example as the concrete configuration.
 */
export interface ReissueVerifier {
  surname: string;
}

export interface SirBookingPort {
  /** Throws `BookingNotFoundError` | `SirUnavailableError` (errors.ts). */
  getReservation(ref: ReservationRef): Promise<SirReservation>;
  getRelocations(ref: ReservationRef): Promise<SirRelocation[]>;
  /** Returns `null` without revealing which part of the verifier was wrong (no enumeration). */
  getContactForLinkDelivery(
    ref: ReservationRef,
    verifier: ReissueVerifier,
  ): Promise<ContactChannel | null>;
}
