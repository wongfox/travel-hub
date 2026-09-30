import { useTranslation } from "react-i18next";

export interface ConsentScreenProps {
  onAccept: () => void;
  onDecline: () => void;
  submitting?: boolean;
}

/**
 * `pre-check-in` / `personal-data-protection`'s consent text and
 * accept/decline controls (task 8.1/8.2, spec "Consent required before
 * camera access", "Consent declined"). Purely presentational — the caller
 * (`PrecheckinConsentGate`) owns actually recording the decision via
 * `POST /api/consents` and gating the capture UI on the result.
 */
export function ConsentScreen({ onAccept, onDecline, submitting = false }: ConsentScreenProps) {
  const { t } = useTranslation();

  return (
    <div>
      <h2>{t("precheckin.consent.title")}</h2>
      <p>{t("precheckin.consent.body")}</p>
      <button type="button" onClick={onAccept} disabled={submitting}>
        {t("precheckin.consent.accept")}
      </button>
      <button type="button" onClick={onDecline} disabled={submitting}>
        {t("precheckin.consent.decline")}
      </button>
    </div>
  );
}
