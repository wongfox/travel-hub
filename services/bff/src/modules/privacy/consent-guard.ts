import type { ConsentPurpose } from "contracts";
import type { ConsentRecordEntry, ConsentStore } from "./consent-store.js";

/**
 * Thrown by `assertConsentGranted` when the matching purpose has never been
 * granted, or its latest recorded state is a withdrawal. Maps directly onto
 * the `consent_required` error envelope code (design-interfaces).
 */
export class ConsentRequiredError extends Error {
  public readonly purpose: ConsentPurpose;

  constructor(purpose: ConsentPurpose) {
    super(`Consent required for purpose "${purpose}"`);
    this.name = "ConsentRequiredError";
    this.purpose = purpose;
  }
}

export interface RequireConsentDeps {
  consentStore: Pick<ConsentStore, "findLatest">;
}

/**
 * The reusable "consent-required guard" (task 8.1's own wording) any
 * consent-gated route/use case calls before performing its action — e.g.
 * pre check-in submission (task 8.3) checking `precheckin_biometric`, or a
 * future push-subscription route checking `push`. Resolves with the latest
 * granted consent record (callers may want its `textVersion`/`recordedAt`
 * for their own audit trail) or rejects with `ConsentRequiredError`,
 * consistent with this module set's existing convention of throwing a typed
 * error the HTTP layer maps to a response code (`SessionExchangeError`,
 * `DocumentNotFoundError`).
 */
export async function assertConsentGranted(
  deps: RequireConsentDeps,
  reservationRef: string,
  passengerRef: string | null,
  purpose: ConsentPurpose,
): Promise<ConsentRecordEntry> {
  const latest = await deps.consentStore.findLatest(reservationRef, passengerRef, purpose);
  if (!latest || !latest.granted) {
    throw new ConsentRequiredError(purpose);
  }
  return latest;
}
