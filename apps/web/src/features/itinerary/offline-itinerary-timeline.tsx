import type { BoardingPassDTO, TripLeg } from "contracts";
import { BoardingPassCard } from "./boarding-pass-card.js";
import { resolveMilestoneStatus } from "./resolve-milestone-status.js";

export interface OfflineItineraryTimelineProps {
  legs: TripLeg[];
  /** The snapshot's cached boarding passes (seat/coach/barcode), matched to legs by `legId`. */
  boardingPasses?: BoardingPassDTO[];
  /** Injectable clock for deterministic tests; defaults to `Date.now`. */
  now?: Date;
}

/**
 * Offline counterpart of `ItineraryTimeline` (task 7.1), rendered from a
 * cached `TripSnapshot` instead of a live `TripDTO`. `TripSnapshot.tickets`
 * (design Data Model "Client-side") has no `id`/`milestoneId` — unlike
 * `TicketDTO`, those fields exist only "to route an online fetch, not to
 * render an already-cached ticket" (`trip-snapshot.ts`) — so this view
 * cannot associate a ticket with its owning leg the way the online timeline
 * does; document association degrades gracefully to "not shown offline"
 * rather than guessing an association. Likewise, `TripSnapshot` carries no
 * `nextMilestone`, so `resolveMilestoneStatus` is always called with `null`
 * — a leg can still resolve to pending/in_progress/completed offline, just
 * never the "next" label, which needs the server's own selection logic.
 */
export function OfflineItineraryTimeline({ legs, boardingPasses = [], now = new Date() }: OfflineItineraryTimelineProps) {
  return (
    <ul className="stack">
      {legs.map((leg) => (
        <BoardingPassCard
          key={leg.id}
          testId="offline-itinerary-milestone"
          leg={leg}
          status={resolveMilestoneStatus(leg, null, now)}
          boardingPass={boardingPasses.find((pass) => pass.legId === leg.id)}
        />
      ))}
    </ul>
  );
}
