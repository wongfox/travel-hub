import type { ServiceTier } from "contracts";
import type { SirLeg } from "../booking/ports.js";
import { resolveServiceTier } from "./resolve-service-tier.js";

/**
 * Server-side counterpart of `apps/web/src/shared/trip/resolve-trip-tier.ts`
 * (task 6.1/6.5): the BFF needs the same "one tier for this trip" resolution
 * to tier-scope `GET /api/content/menu` (task 9.3) before the client ever
 * sees a `TripDTO`. Same resolution order (design "Open Questions": per-leg
 * tier switching TBD) — next milestone's leg tier first, falling back to the
 * first leg's tier, then the neutral `"UNKNOWN"` when there are no legs.
 */
export function resolveTripOverallTier(legs: SirLeg[], nextMilestoneLegRef: string | null): ServiceTier {
  if (nextMilestoneLegRef) {
    const nextLeg = legs.find((leg) => leg.legRef === nextMilestoneLegRef);
    if (nextLeg) {
      return resolveServiceTier(nextLeg.tier);
    }
  }
  return resolveServiceTier(legs[0]?.tier);
}
