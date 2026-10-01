import type { ConsentPurpose, ConsentState } from "contracts";
import type { ConsentStore } from "./consent-store.js";
import type { PushSubscriptionStore } from "../notifications/ports.js";
import type { PiiAccessAuditPort } from "../../infra/audit/pii-access-audit.js";

const WITHDRAWAL_ACTOR = "api:consent-withdrawal-cascade";

export interface RecordConsentUseCaseInput {
  linkId: string;
  reservationRef: string;
  purpose: ConsentPurpose;
  textVersion: string;
  granted: boolean;
}

export interface RecordConsentDeps {
  consentStore: Pick<ConsentStore, "record">;
  /**
   * `personal-data-protection`'s consent-withdrawal cascade (task 12.3):
   * when `purpose === "push"` and `granted === false`, every push
   * subscription for this reservation is deleted IMMEDIATELY, in this same
   * call — not deferred to the next scheduled purge run. Optional so every
   * caller that predates task 12.3 keeps working unchanged (e.g. the
   * `pulse`/`precheckin_biometric`/`analytics` purposes never touch this
   * dependency at all). The consent withdrawal itself is already durably
   * recorded before this cascade runs (see below), so a deletion failure
   * here is caught and audited distinctly (`action: "purge_failed"`) rather
   * than thrown — surfacing it as an HTTP error would mask the already-
   * successful consent recording behind a failure the client has no reason
   * to retry. There is no automated reconciliation scan for a failed
   * cascade yet (only `listExpired`-driven purging exists); an operator
   * reconciles from the audit trail until one lands.
   */
  pushSubscriptionStore?: Pick<PushSubscriptionStore, "deleteByReservation">;
  /** `pii_access_audit` write point for this cascade's deletion (task 12.3). */
  piiAccessAudit?: PiiAccessAuditPort;
}

/**
 * `POST /api/consents` use case (task 8.1): appends a new consent record
 * (always at reservation scope — `passengerRef: null` — see `consent-store.ts`'s
 * doc comment on why no passenger identifier exists yet) and projects it to
 * the `ConsentState` shape the HTTP layer returns.
 */
export async function recordConsent(
  input: RecordConsentUseCaseInput,
  deps: RecordConsentDeps,
): Promise<ConsentState> {
  const record = await deps.consentStore.record({
    linkId: input.linkId,
    reservationRef: input.reservationRef,
    passengerRef: null,
    purpose: input.purpose,
    textVersion: input.textVersion,
    granted: input.granted,
  });

  if (input.purpose === "push" && !input.granted && deps.pushSubscriptionStore) {
    try {
      await deps.pushSubscriptionStore.deleteByReservation(input.reservationRef);
      await deps.piiAccessAudit?.record({
        actor: WITHDRAWAL_ACTOR,
        action: "purge",
        subjectType: "push_subscription",
        subjectId: input.reservationRef,
      });
    } catch {
      await deps.piiAccessAudit?.record({
        actor: WITHDRAWAL_ACTOR,
        action: "purge_failed",
        subjectType: "push_subscription",
        subjectId: input.reservationRef,
      });
    }
  }

  return {
    purpose: record.purpose,
    granted: record.granted,
    textVersion: record.textVersion,
    recordedAt: record.recordedAt,
  };
}
