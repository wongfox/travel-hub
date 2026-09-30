import type { NextMilestone, ServiceTier, TripLeg } from "contracts";

/**
 * The single tier used to theme trip-home/itinerary/documents
 * (`service-tier-experience`: adapt theme via tokens, never tier-specific
 * branches). Mixed-tier bookings are a named design open item (design "Open
 * Questions": per-leg tier switching TBD) — this resolves the *next*
 * milestone's leg tier first (the tier relevant right now), falling back to
 * the first leg's tier, then `UNKNOWN` when there are no legs at all (the
 * same neutral fallback `resolveThemeTokens` already applies).
 */
export function resolveTripTier(legs: TripLeg[], nextMilestone: NextMilestone): ServiceTier {
  if (nextMilestone) {
    const nextLeg = legs.find((leg) => leg.id === nextMilestone.legId);
    if (nextLeg) {
      return nextLeg.tier;
    }
  }
  return legs[0]?.tier ?? "UNKNOWN";
}
