import type { TripLeg } from "contracts";

/**
 * `experience-pulse`'s "defined trip moment" (task 11.6): the spec leaves
 * exact timing TBD, owned by Content/UX. This is a concrete, documented
 * default — the first leg that has reached `COMPLETED` status is the
 * trigger moment (a natural "how did that leg go?" checkpoint) — not an
 * invented business answer; tune once Content/UX define the real cadence.
 */
export function resolvePulseTriggerLeg(legs: TripLeg[]): TripLeg | null {
  return legs.find((leg) => leg.status === "COMPLETED") ?? null;
}
