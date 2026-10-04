import type { TripDTO } from "contracts";

/**
 * Whether the passenger may be offered pre check-in: the capture UI flag is on
 * AND a consent text version is published (without one the web keeps the
 * feature unavailable instead of inventing a version). Shared by the trip
 * screens' tab bar so the gate is defined once.
 */
export function isPrecheckinOffered(trip: Pick<TripDTO, "features" | "consentTextVersions">): boolean {
  return Boolean(trip.features.precheckinCaptureUi && trip.consentTextVersions?.precheckin);
}
