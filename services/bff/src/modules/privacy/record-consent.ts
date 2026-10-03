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
  /** Consent-withdrawal cascade (task 12.3): deletes push subscriptions immediately on withdrawal; a deletion failure is audited as `"purge_failed"`, never thrown (R4), since the consent itself is already recorded. */
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
    let action: "purge" | "purge_failed" = "purge";
    try {
      await deps.pushSubscriptionStore.deleteByReservation(input.reservationRef);
    } catch {
      action = "purge_failed";
    }
    try {
      await deps.piiAccessAudit?.record({
        actor: WITHDRAWAL_ACTOR,
        action,
        subjectType: "push_subscription",
        subjectId: input.reservationRef,
      });
    } catch {
      // Swallowed intentionally — see doc comment above: audit-write failure must not surface as an HTTP error either.
    }
  }

  return {
    purpose: record.purpose,
    granted: record.granted,
    textVersion: record.textVersion,
    recordedAt: record.recordedAt,
    recordId: record.id,
  };
}
