const VISIBLE_SUFFIX_LENGTH = 4;

/**
 * `TripDTO.reservationRefMasked` (design-interfaces): partially obscures the
 * SIR reservation reference before it ever reaches the client, keeping only
 * the last 4 characters visible (enough for a passenger/support agent to
 * cross-check against a booking confirmation without exposing the full
 * reference to anyone who merely holds a leaked link). A reference no longer
 * than the visible window is masked entirely rather than revealed in full.
 */
export function maskReservationRef(reservationRef: string): string {
  if (reservationRef.length <= VISIBLE_SUFFIX_LENGTH) {
    return "*".repeat(reservationRef.length);
  }
  const maskedPrefixLength = reservationRef.length - VISIBLE_SUFFIX_LENGTH;
  const maskedPrefix = "*".repeat(maskedPrefixLength);
  const visibleSuffix = reservationRef.slice(maskedPrefixLength);
  return `${maskedPrefix}${visibleSuffix}`;
}
