import type { LegStatus, TripLeg } from "contracts";

export type MilestoneStatus = "pending" | "next" | "in_progress" | "completed";

/** Terminal per `select-next-milestone.ts`'s own definition on the BFF side. */
const TERMINAL_LEG_STATUSES = new Set<LegStatus>(["COMPLETED", "CANCELLED"]);

/**
 * Maps a leg onto the itinerary timeline's 4-state vocabulary (spec
 * `trip-itinerary` "Timeline renders purchased services in order": pending,
 * next, in progress, completed). `CANCELLED` is folded into `completed`
 * (terminal, no longer actionable) since the spec's itinerary vocabulary
 * only names those four states — a deliberate simplification, not a data
 * loss: the leg's own `LegStatus` (`TripLeg.status`) is still available to
 * any caller that needs the finer-grained BFF value.
 */
export function resolveMilestoneStatus(
  leg: TripLeg,
  nextMilestoneLegId: string | null,
  now: Date,
): MilestoneStatus {
  if (TERMINAL_LEG_STATUSES.has(leg.status)) {
    return "completed";
  }
  if (leg.id === nextMilestoneLegId) {
    return "next";
  }
  const departure = new Date(leg.departureLocal.endsWith("Z") ? leg.departureLocal : `${leg.departureLocal}Z`);
  return now.getTime() >= departure.getTime() ? "in_progress" : "pending";
}
