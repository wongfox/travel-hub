import { useTranslation } from "react-i18next";
import type { NextMilestone, TicketDTO, TripLeg } from "contracts";
import { formatLocalDateTime } from "../../shared/format/format-local-datetime.js";
import { resolveMilestoneStatus, type MilestoneStatus } from "./resolve-milestone-status.js";

const STATUS_LABEL_KEYS: Record<MilestoneStatus, string> = {
  pending: "itinerary.status.pending",
  next: "itinerary.status.next",
  in_progress: "itinerary.status.inProgress",
  completed: "itinerary.status.completed",
};

export interface ItineraryTimelineProps {
  legs: TripLeg[];
  documents: TicketDTO[];
  nextMilestone: NextMilestone;
  /** Injectable clock for deterministic tests; defaults to `Date.now`. */
  now?: Date;
}

/**
 * `trip-itinerary`'s timeline (spec "Timeline renders purchased services in
 * order", "Ticket linked from itinerary entry"): one entry per leg, in the
 * order `TripDTO.legs` already arrives in, each showing its resolved status
 * and any documents associated with it via `TicketDTO.milestoneId`.
 */
export function ItineraryTimeline({ legs, documents, nextMilestone, now = new Date() }: ItineraryTimelineProps) {
  const { t, i18n } = useTranslation();

  return (
    <ul>
      {legs.map((leg) => {
        const status = resolveMilestoneStatus(leg, nextMilestone?.legId ?? null, now);
        const legDocuments = documents.filter((document) => document.milestoneId === leg.id);

        return (
          <li key={leg.id} data-testid="itinerary-milestone">
            <p>
              {leg.origin} → {leg.destination}
            </p>
            <p>{formatLocalDateTime(leg.departureLocal, i18n.language)}</p>
            <p>{t(STATUS_LABEL_KEYS[status])}</p>
            {legDocuments.length > 0 && (
              <ul>
                {legDocuments.map((document) => (
                  <li key={document.id}>{document.title}</li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
