import type { BoardingPassDTO } from "contracts";
import type { SirLeg, SirRelocation } from "../booking/ports.js";
import { resolveServiceTier } from "./resolve-service-tier.js";

/**
 * `trip-itinerary`'s boarding-pass view (task 6.3): one `BoardingPassDTO`
 * per leg, derived from that leg's boarding-pass fields. A recorded
 * `SirRelocation.newSeat` for the same `legRef` overrides the leg's original
 * seat, so the boarding pass reflects a relocation automatically on the next
 * fetch — no passenger action required (spec "Relocation updates boarding
 * pass automatically"). Only `newSeat` is modeled by `SirRelocation` today;
 * coach/car reassignment is not yet part of the domain model (see
 * apply-progress deviations).
 */
export function buildBoardingPasses(legs: SirLeg[], relocations: SirRelocation[]): BoardingPassDTO[] {
  const newSeatByLeg = new Map(
    relocations.filter((relocation) => relocation.newSeat !== undefined).map((relocation) => [relocation.legRef, relocation.newSeat!]),
  );

  return legs.map((leg) => ({
    legId: leg.legRef,
    barcodeFormat: leg.barcodeFormat,
    barcodePayload: leg.barcodePayload,
    seat: newSeatByLeg.get(leg.legRef) ?? leg.seat,
    coach: leg.coach,
    tier: resolveServiceTier(leg.tier),
  }));
}
