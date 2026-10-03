import { useTranslation } from "react-i18next";

export interface PurposeConsentScreenProps {
  /** i18n key prefix owning `title`, `body`, `accept` and `decline` (e.g. `consent.push`). */
  i18nPrefix: string;
  onAccept: () => void;
  onDecline: () => void;
  submitting?: boolean;
}

/**
 * Presentational consent text plus accept/decline controls for any consent
 * purpose. The container (`PurposeConsentGate`) owns recording the decision.
 *
 * TODO(legal): `consent.push.*` and `consent.pulse.*` (es/en/pt `common.json`)
 * are provisional copy. Legal must replace it before production.
 */
export function PurposeConsentScreen({ i18nPrefix, onAccept, onDecline, submitting = false }: PurposeConsentScreenProps) {
  const { t } = useTranslation();
  return (
    <div>
      <h2>{t(`${i18nPrefix}.title`)}</h2>
      <p>{t(`${i18nPrefix}.body`)}</p>
      <button type="button" onClick={onAccept} disabled={submitting}>
        {t(`${i18nPrefix}.accept`)}
      </button>
      <button type="button" onClick={onDecline} disabled={submitting}>
        {t(`${i18nPrefix}.decline`)}
      </button>
    </div>
  );
}
