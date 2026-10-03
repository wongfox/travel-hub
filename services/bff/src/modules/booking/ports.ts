import type { LegStatus, ServiceTier, TicketKind } from "contracts";
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
  /**
   * Boarding-pass fields (`trip-itinerary`, task 6.3): the assigned seat and
   * coach for this leg's train segment, and the barcode rendered client-side
   * on the boarding pass view. `seat` is the pre-relocation assignment — a
   * recorded `SirRelocation.newSeat` for the same `legRef` overrides it.
   */
  seat: string;
  coach: string;
  barcodeFormat: string;
  barcodePayload: string;
}

/**
 * A purchased ancillary ticket (`travel-documents`, task 6.4): Consettur,
 * INC entry, meal/tea-time, or another non-train service. Train tickets are
 * not modeled here — they derive directly from `SirLeg`'s boarding-pass
 * fields, since a train segment's own leg data is already the source of
 * truth for its ticket.
 */
export interface SirTicket {
  ticketRef: string;
  kind: TicketKind;
  title: string;
  /** The itinerary milestone (leg) this ticket is associated with (`travel-documents` "Ticket-to-milestone association"), or `null` when it has none. */
  milestoneLegRef: string | null;
  /** Present when the ticket renders as a client-side barcode; mutually typical with `fileId`, not enforced exclusive. */
  barcodePayload?: string;
  /** Present when the ticket is a third-party binary file fetched via `TicketDocumentPort`. */
  fileId?: string;
}

export interface SirReservation {
  reservationRef: string;
  passengers: SirPassenger[];
  legs: SirLeg[];
  contact: ContactChannel;
  tickets: SirTicket[];
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

/** One POS-equivalent sale line item (`booking-data-integration` "Write WiFi sale to SIR"). */
export interface PosSale {
  reservationRef: string;
  passengerRef: string;
  packageCode: string;
  amountMinor: number;
  currency: string;
}

/**
 * `SirPosPort` per `sdd/travel-hub-mvp/design-interfaces`: registers a
 * successful WiFi sale in SIR using POS-equivalent sale-registration logic
 * (`booking-data-integration`'s "Write WiFi sale to SIR with POS logic"
 * requirement), and voids a sale when a purchase must be reversed. Task
 * 10.3's SIR-registration job calls `registerSale` only after entitlement
 * activation has already succeeded (design Decision 8); exhausted retries
 * land in reconciliation, never trigger `voidSale` from that job itself.
 */
export interface SirPosPort {
  /** MUST be idempotent per `idempotencyKey` (task 10.3): a retried registration for the same key returns the same `saleRef`, never a second POS entry. */
  registerSale(sale: PosSale, idempotencyKey: string): Promise<{ saleRef: string }>;
  voidSale(saleRef: string, reason: string): Promise<void>;
}
