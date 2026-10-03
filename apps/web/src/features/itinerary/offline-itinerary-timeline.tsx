import { useTranslation } from "react-i18next";
import type { TripLeg } from "contracts";
import { formatLocalDateTime } from "../../shared/format/format-local-datetime.js";
import { resolveMilestoneStatus, type MilestoneStatus } from "./resolve-milestone-status.js";

const STATUS_LABEL_KEYS: Record<MilestoneStatus, string> = {
  pending: "itinerary.status.pending",
  next: "itinerary.status.next",
  in_progress: "itinerary.status.inProgress",
  completed: "itinerary.status.completed",
};

export interface OfflineItineraryTimelineProps {
  legs: TripLeg[];
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
export function OfflineItineraryTimeline({ legs, now = new Date() }: OfflineItineraryTimelineProps) {
  const { t, i18n } = useTranslation();

  return (
    <ul>
      {legs.map((leg) => {
        const status = resolveMilestoneStatus(leg, null, now);

        return (
          <li key={leg.id} data-testid="offline-itinerary-milestone">
            <p>
              {leg.origin} → {leg.destination}
            </p>
            <p>{formatLocalDateTime(leg.departureLocal, i18n.language)}</p>
            <p>{t(STATUS_LABEL_KEYS[status])}</p>
          </li>
        );
      })}
    </ul>
  );
}
