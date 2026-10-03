import type { ReactNode } from "react";
import type { ApiClient } from "../../../shared/api/client.js";
import { PurposeConsentGate } from "../../../shared/consent/purpose-consent-gate.js";

export interface PrecheckinConsentGateProps {
  apiClient: ApiClient;
  /** The currently published consent text's version (design's `PRECHECKIN_CONSENT_TEXT_VERSION`, go-live-guard input). */
  consentTextVersion: string;
  children: ReactNode;
}

/**
 * `pre-check-in`'s consent gate (task 8.1/8.2, spec "Consent required before
 * camera access": "the system... MUST NOT request camera access or accept an
 * uploaded file until consent is given"): the shared `PurposeConsentGate`
 * bound to `precheckin_biometric`. Deliberately no `cacheScope`: biometric
 * consent is never cached on the device, so it is asked on every visit.
 */
export function PrecheckinConsentGate({ apiClient, consentTextVersion, children }: PrecheckinConsentGateProps) {
  return (
    <PurposeConsentGate
      apiClient={apiClient}
      purpose="precheckin_biometric"
      textVersion={consentTextVersion}
      i18nPrefix="precheckin.consent"
    >
      {children}
    </PurposeConsentGate>
  );
}
