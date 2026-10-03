import type { SirLeg } from "../booking/ports.js";

/**
 * Resolves "trip end" for the `purge_after` formula (design's pre check-in
 * Security section: `purge_after = min(handed_off_at + HANDOFF_GRACE, trip
 * end + PRECHECKIN_RETENTION_DAYS)`): the latest `arrivalLocal` across every
 * leg on the reservation (a round trip's return leg, not just the first/only
 * leg). Falls back to `now` (injectable for deterministic tests) when the
 * reservation has no legs yet, rather than throwing — an edge case a stub/
 * incomplete `SirBookingPort` fixture can produce, and retention must still
 * have a usable floor rather than block on it.
 */
export function resolveTripEndLocal(legs: SirLeg[], now: () => Date = () => new Date()): string {
  if (legs.length === 0) {
    return now().toISOString();
  }
  return legs.reduce(
    (latest, leg) => (new Date(leg.arrivalLocal).getTime() > new Date(latest).getTime() ? leg.arrivalLocal : latest),
    legs[0]!.arrivalLocal,
  );
}
