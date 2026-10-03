import type { NextMilestone } from "contracts";
import type { SirLeg } from "../booking/ports.js";

/** Legs in these statuses are done and never the "next" milestone (design's `trip-home` "no stale next milestone"). */
const TERMINAL_LEG_STATUSES = new Set(["COMPLETED", "CANCELLED"]);

/**
 * `trip-home`'s "next itinerary milestone" (task 6.2): the earliest
 * not-yet-terminal leg by scheduled departure. Returns `null` when every leg
 * is completed/cancelled, so the caller can show "trip complete" instead of a
 * stale or missing next-milestone module (spec `trip-home` "No further
 * milestones" scenario). A `RELOCATED` leg is still upcoming, not terminal.
 */
export function selectNextMilestone(legs: SirLeg[]): NextMilestone {
  const upcoming = legs
    .filter((leg) => !TERMINAL_LEG_STATUSES.has(leg.status))
    .sort((a, b) => new Date(a.departureLocal).getTime() - new Date(b.departureLocal).getTime());

  const next = upcoming[0];
  if (!next) {
    return null;
  }

  return { legId: next.legRef, kind: "departure", atLocal: next.departureLocal };
}
