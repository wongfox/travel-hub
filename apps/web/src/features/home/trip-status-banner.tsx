import { useTranslation } from "react-i18next";
import type { NextMilestone, ServiceTier, TripLeg } from "contracts";
import { formatLocalDateTime } from "../../shared/format/format-local-datetime.js";
import { Icon } from "../../shared/ui/atoms/icon.js";
import { TierBadge } from "../../shared/ui/molecules/tier-badge.js";
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
  /** The trip's resolved service tier; when given, shown as a tier badge on the hero. */
  tier?: ServiceTier | undefined;
  /** Passenger names to list under the hero; the section is omitted when empty. */
  passengers?: { ordinal: number; displayName: string }[] | undefined;
}

/**
 * `trip-home`'s status + next-milestone module (spec "Trip status display",
 * "Next itinerary milestone", "No further milestones"). Presentational —
 * takes the already-resolved `status` and raw `nextMilestone`/`legs` from
 * `TripDTO` and renders them; `trip-home-page.tsx` owns the data fetching.
 */
export function TripStatusBanner({ status, nextMilestone, legs, tier, passengers = [] }: TripStatusBannerProps) {
  const { t, i18n } = useTranslation();
  const nextLeg = nextMilestone ? legs.find((leg) => leg.id === nextMilestone.legId) : undefined;

  return (
    <div data-testid="trip-status-banner" className="stack">
      <div className="trip-hero">
        {tier && (
          <div className="trip-hero__top">
            <TierBadge tier={tier} />
          </div>
        )}
        <h2 data-testid="trip-status" className="trip-hero__status">
          {t(STATUS_LABEL_KEYS[status])}
        </h2>
        <p data-testid="next-milestone" className="trip-hero__next">
          <Icon name="clock" />
          <span>
            {nextMilestone && nextLeg
              ? t("trip.nextMilestone.label", {
                  origin: nextLeg.origin,
                  destination: nextLeg.destination,
                  time: formatLocalDateTime(nextMilestone.atLocal, i18n.language),
                })
              : t("trip.nextMilestone.none")}
          </span>
        </p>
      </div>
      {passengers.length > 0 && (
        <section className="stack" aria-labelledby="trip-passengers-heading">
          <h3 id="trip-passengers-heading" className="section-title">
            {t("trip.passengers")}
          </h3>
          <ul className="passenger-list">
            {passengers.map((passenger) => (
              <li key={passenger.ordinal} className="chip">
                {passenger.displayName}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
