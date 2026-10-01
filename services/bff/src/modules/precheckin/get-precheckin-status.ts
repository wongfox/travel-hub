import type { PrecheckinStatus } from "contracts";
import type { PrecheckinSubmissionStore } from "./ports.js";

export interface GetPrecheckinStatusDeps {
  submissionStore: Pick<PrecheckinSubmissionStore, "findByPassenger">;
}

/**
 * Per-passenger completion status (task 8.4 / `TripDTO.passengers[].precheckinStatus`
 * wiring): `"received"` once a submission exists for this exact
 * `(reservationRef, passengerRef)` pair, `"none"` otherwise. `"unavailable"`
 * (e.g. purged after retention) is not produced by this function — purge
 * lands in task 8.5.
 */
export async function getPrecheckinStatusForPassenger(
  reservationRef: string,
  passengerRef: string,
  deps: GetPrecheckinStatusDeps,
): Promise<PrecheckinStatus> {
  const existing = await deps.submissionStore.findByPassenger(reservationRef, passengerRef);
  return existing ? "received" : "none";
}
