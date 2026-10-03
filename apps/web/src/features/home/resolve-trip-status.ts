import type { TripLeg } from "contracts";

export type TripStatus = "upcoming" | "in_progress" | "completed";

/**
 * Aggregate trip status (`trip-home` "Trip status display" — GIVEN
 * milestones in pending/next/in-progress/completed states, THEN the
 * displayed trip status reflects the aggregate progress). `hasNextMilestone`
 * mirrors the BFF's own authoritative signal (`selectNextMilestone` returns
 * `null` once every leg is terminal) — spec's "No further milestones"
 * scenario requires showing "trip complete" instead of a stale/missing
 * next-milestone module, so a missing next milestone always wins.
 */
export function resolveTripStatus(legs: TripLeg[], hasNextMilestone: boolean): TripStatus {
  if (!hasNextMilestone) {
    return "completed";
  }
  const allScheduled = legs.every((leg) => leg.status === "SCHEDULED");
  return allScheduled ? "upcoming" : "in_progress";
}
