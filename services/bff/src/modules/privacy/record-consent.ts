import type { ConsentPurpose, ConsentState } from "contracts";
import type { ConsentStore } from "./consent-store.js";

export interface RecordConsentUseCaseInput {
  linkId: string;
  reservationRef: string;
  purpose: ConsentPurpose;
  textVersion: string;
  granted: boolean;
}

export interface RecordConsentDeps {
  consentStore: Pick<ConsentStore, "record">;
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

  return {
    purpose: record.purpose,
    granted: record.granted,
    textVersion: record.textVersion,
    recordedAt: record.recordedAt,
  };
}
