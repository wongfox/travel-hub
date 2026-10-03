import { PurposeConsentScreen } from "../../../shared/consent/purpose-consent-screen.js";

export interface ConsentScreenProps {
  onAccept: () => void;
  onDecline: () => void;
  submitting?: boolean;
}

/**
 * `pre-check-in` / `personal-data-protection`'s consent text and
 * accept/decline controls (task 8.1/8.2, spec "Consent required before
 * camera access", "Consent declined"): the shared `PurposeConsentScreen`
 * bound to the `precheckin.consent.*` copy.
 */
export function ConsentScreen(props: ConsentScreenProps) {
  return <PurposeConsentScreen i18nPrefix="precheckin.consent" {...props} />;
}
