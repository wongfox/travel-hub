import type { AlertDTO } from "contracts";
import type { SirRelocation } from "../booking/ports.js";

/**
 * `trip-home`'s relocation/incident banner (task 6.2, spec "baseline
 * channel"): maps every recorded relocation into an in-app `AlertDTO`. Pure
 * over `SirRelocation[]` alone — it never consults push-subscription state,
 * which is exactly how the spec's "Banner is the sole channel for a
 * link-only, non-push passenger" and "shown to every session ... regardless
 * of push subscription state" scenarios are satisfied: the banner is always
 * populated from `alerts[]`, independent of any push wiring (`push-notifications`,
 * not yet built).
 */
export function buildRelocationAlerts(relocations: SirRelocation[]): AlertDTO[] {
  return relocations.map((relocation) => ({
    id: `relocation:${relocation.legRef}:${relocation.recordedAt}`,
    type: "RELOCATION",
    legId: relocation.legRef,
    titleKey: "alerts.relocation.title",
    bodyKey: "alerts.relocation.body",
    occurredAt: relocation.recordedAt,
  }));
}
