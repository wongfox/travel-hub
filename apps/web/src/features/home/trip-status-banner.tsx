import { useTranslation } from "react-i18next";
import type { NextMilestone, TripLeg } from "contracts";
import { formatLocalDateTime } from "../../shared/format/format-local-datetime.js";
import type { TripStatus } from "./resolve-trip-status.js";

const STATUS_LABEL_KEYS: Record<TripStatus, string> = {
  upcoming: "trip.status.upcoming",
  in_progress: "trip.status.inProgress",
  completed: "trip.status.completed",
};

export interface TripStatusBannerProps {
  status: TripStatus;
  nextMilestone: NextMilestone;
  legs: TripLeg[];
}

/**
 * `trip-home`'s status + next-milestone module (spec "Trip status display",
 * "Next itinerary milestone", "No further milestones"). Presentational —
 * takes the already-resolved `status` and raw `nextMilestone`/`legs` from
 * `TripDTO` and renders them; `trip-home-page.tsx` owns the data fetching.
 */
export function TripStatusBanner({ status, nextMilestone, legs }: TripStatusBannerProps) {
  const { t, i18n } = useTranslation();
  const nextLeg = nextMilestone ? legs.find((leg) => leg.id === nextMilestone.legId) : undefined;

  return (
    <div data-testid="trip-status-banner">
      <h2 data-testid="trip-status">{t(STATUS_LABEL_KEYS[status])}</h2>
      <p data-testid="next-milestone">
        {nextMilestone && nextLeg
          ? t("trip.nextMilestone.label", {
              origin: nextLeg.origin,
              destination: nextLeg.destination,
              time: formatLocalDateTime(nextMilestone.atLocal, i18n.language),
            })
          : t("trip.nextMilestone.none")}
      </p>
    </div>
  );
}
