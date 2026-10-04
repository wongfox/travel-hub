import type { BoardingPassDTO, NextMilestone, TicketDTO, TripLeg } from "contracts";
import { BoardingPassCard } from "./boarding-pass-card.js";
import { resolveMilestoneStatus } from "./resolve-milestone-status.js";

export interface ItineraryTimelineProps {
  legs: TripLeg[];
  documents: TicketDTO[];
  nextMilestone: NextMilestone;
  /** `TripDTO.boardingPasses`: seat/coach/barcode shown on the matching leg. Optional so callers without it still render. */
  boardingPasses?: BoardingPassDTO[];
  /** Injectable clock for deterministic tests; defaults to `Date.now`. */
  now?: Date;
}

/**
 * `trip-itinerary`'s timeline (spec "Timeline renders purchased services in
 * order", "Ticket linked from itinerary entry"): one boarding-pass card per
 * leg, in the order `TripDTO.legs` already arrives in, each showing its
 * resolved status, its boarding pass (matched by `legId`) and any documents
 * associated with it via `TicketDTO.milestoneId`.
 */
export function ItineraryTimeline({
  legs,
  documents,
  nextMilestone,
  boardingPasses = [],
  now = new Date(),
}: ItineraryTimelineProps) {
  return (
    <ul className="stack">
      {legs.map((leg) => (
        <BoardingPassCard
          key={leg.id}
          testId="itinerary-milestone"
          leg={leg}
          status={resolveMilestoneStatus(leg, nextMilestone?.legId ?? null, now)}
          boardingPass={boardingPasses.find((pass) => pass.legId === leg.id)}
          documentTitles={documents.filter((document) => document.milestoneId === leg.id).map((document) => document.title)}
        />
      ))}
    </ul>
  );
}
