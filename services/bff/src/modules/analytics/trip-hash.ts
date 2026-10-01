import { createHmac } from "node:crypto";

/**
 * `trip_hash = HMAC-SHA256(reservation_ref, secret)` (design Data Model:
 * "analytics never sees raw references"; design-interfaces'
 * `AnalyticsSinkPort` comment: "trip_hash only, never reservation_ref").
 * This is the ONLY place a raw `reservationRef` is ever combined with the
 * analytics secret; every other analytics module function only ever sees
 * the resulting hash, never the reservation reference itself (task 12.1
 * acceptance: neither `analytics_event` rows nor `AnalyticsSinkPort`
 * payloads ever show a raw `reservation_ref`).
 */
export function computeTripHash(reservationRef: string, secret: string): string {
  return createHmac("sha256", secret).update(reservationRef).digest("hex");
}
