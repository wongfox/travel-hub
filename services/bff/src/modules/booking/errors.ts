/**
 * `booking-data-integration` error taxonomy (design-interfaces:
 * `SirBookingPort.getReservation` "throws BookingNotFound | SirUnavailable").
 * Kept as real `Error` subclasses (not error codes) so callers can
 * `instanceof`-narrow without a string-matching convention.
 */
export class BookingNotFoundError extends Error {
  constructor(reservationRef: string) {
    super(`No SIR reservation found for reference "${reservationRef}"`);
    this.name = "BookingNotFoundError";
  }
}

export class SirUnavailableError extends Error {
  constructor(cause?: string) {
    super(`SIR is unavailable${cause ? `: ${cause}` : ""}`);
    this.name = "SirUnavailableError";
  }
}
