import type { TripDTO } from "contracts";
import type { SirBookingPort } from "../booking/ports.js";
import type { AccessLinkRecord } from "../trip-access/access-link-store.js";
import { FLAG_DEFAULTS, resolvePassengerFeatures, type FlagKey } from "../../config/flags.js";
import { resolveServiceTier } from "./resolve-service-tier.js";
import { selectNextMilestone } from "./select-next-milestone.js";
import { buildRelocationAlerts } from "./build-relocation-alerts.js";
import { maskReservationRef } from "./mask-reservation-ref.js";

export interface GetTripOverviewDeps {
  sirBooking: Pick<SirBookingPort, "getReservation" | "getRelocations">;
  /** Server-side flag table; defaults to the compiled-in defaults (task 3.2) when omitted. */
  flags?: Record<FlagKey, boolean>;
  /** Injectable clock for deterministic tests; defaults to `Date.now`. */
  now?: () => Date;
}

/**
 * `trip-home`'s `GET /api/trip` overview projection (task 6.2): the single
 * payload `trip-home`, `trip-itinerary`, `travel-documents`, and
 * `service-tier-experience` all render from (design's Data Flow section).
 *
 * `boardingPasses`/`documents` are intentionally empty here — the boarding
 * pass view (`trip-itinerary`, task 6.3) and ticket listing
 * (`travel-documents`, task 6.4) populate those fields in the next work
 * unit; this overview already carries every field `trip-home` itself needs
 * (status/next-milestone/alerts, task 6.2's own scope). Likewise
 * `precheckinStatus` defaults to `"none"` for every passenger until
 * `pre-check-in` (Phase 8) exists.
 */
export async function getTripOverview(
  accessLink: AccessLinkRecord,
  deps: GetTripOverviewDeps,
): Promise<TripDTO> {
  const now = deps.now ? deps.now() : new Date();
  const [reservation, relocations] = await Promise.all([
    deps.sirBooking.getReservation({ reservationRef: accessLink.reservationRef }),
    deps.sirBooking.getRelocations({ reservationRef: accessLink.reservationRef }),
  ]);

  const scopedPassengers =
    accessLink.passengerScope.length === 0
      ? reservation.passengers
      : reservation.passengers.filter((passenger) => accessLink.passengerScope.includes(passenger.passengerRef));

  return {
    linkId: accessLink.id,
    reservationRefMasked: maskReservationRef(accessLink.reservationRef),
    expiresAt: accessLink.expiresAt,
    passengers: scopedPassengers.map((passenger) => ({
      ordinal: passenger.ordinal,
      displayName: passenger.displayName,
      precheckinStatus: "none",
    })),
    legs: reservation.legs.map((leg) => ({
      id: leg.legRef,
      origin: leg.origin,
      destination: leg.destination,
      departureLocal: leg.departureLocal,
      arrivalLocal: leg.arrivalLocal,
      tier: resolveServiceTier(leg.tier),
      status: leg.status,
    })),
    boardingPasses: [],
    documents: [],
    alerts: buildRelocationAlerts(relocations),
    nextMilestone: selectNextMilestone(reservation.legs),
    features: resolvePassengerFeatures(deps.flags ?? FLAG_DEFAULTS),
    fetchedAt: now.toISOString(),
  };
}
