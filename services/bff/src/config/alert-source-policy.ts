import type { AlertSourcePolicy, AlertType } from "contracts";

/** Every alert type the trip-home banner and push notifications share (contracts' `AlertTypeSchema`). */
const ALL_ALERT_TYPES: AlertType[] = ["DELAY", "RELOCATION", "INCIDENT"];

/**
 * Design Decision 11's `AlertSourcePolicy` default (task 11.2): RELOCATION
 * is the only alert type this adapter can currently detect (the SIR booking
 * stub only exposes relocation events, per `SirBookingPort.getRelocations`),
 * so it is the one picked as push's official source here — a narrow,
 * documented implementation choice, not the business decision the spec
 * leaves TBD ("the official source per alert type is configurable, to be
 * defined in design with Operations/CS"). DELAY and INCIDENT default to
 * banner-only until a real event source can report them, avoiding a push
 * promise this adapter cannot keep.
 */
export const DEFAULT_ALERT_SOURCE_POLICY: AlertSourcePolicy = {
  DELAY: { pushIsOfficialSource: false },
  RELOCATION: { pushIsOfficialSource: true },
  INCIDENT: { pushIsOfficialSource: false },
};

/**
 * The `push.enabled` go-live guard's "AlertSourcePolicy for all alert types"
 * prerequisite (config/go-live-guards.ts's `checkPushEnabled`): true only
 * when every `AlertType` has a declared entry.
 */
export function isAlertSourcePolicyComplete(policy: Partial<AlertSourcePolicy>): boolean {
  return ALL_ALERT_TYPES.every((type) => policy[type] !== undefined);
}
