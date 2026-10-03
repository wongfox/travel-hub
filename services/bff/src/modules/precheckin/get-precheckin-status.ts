import type { PrecheckinStatus } from "contracts";
import type { PrecheckinSubmissionStore } from "./ports.js";

export interface GetPrecheckinStatusDeps {
  submissionStore: Pick<PrecheckinSubmissionStore, "findByPassenger">;
}

/**
 * Per-passenger completion status (task 8.4 / `TripDTO.passengers[].precheckinStatus`
 * wiring): `"none"` when no submission exists; `"received"` for a submission
 * in status `"received"` or `"handed_off"` (handoff is an internal
 * processing step — the passenger never sees a difference, since submitted
 * images are never re-displayed either way); `"unavailable"` once the
 * submission has been purged past its retention period (task 8.5).
 */
export async function getPrecheckinStatusForPassenger(
  reservationRef: string,
  passengerRef: string,
  deps: GetPrecheckinStatusDeps,
): Promise<PrecheckinStatus> {
  const existing = await deps.submissionStore.findByPassenger(reservationRef, passengerRef);
  if (!existing) return "none";
  return existing.status === "purged" ? "unavailable" : "received";
}
