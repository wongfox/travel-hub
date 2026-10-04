import { useTranslation } from "react-i18next";
import { Button } from "../ui/atoms/button.js";
import { Icon } from "../ui/atoms/icon.js";

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
    <div className="consent">
      <span className="consent__icon">
        <Icon name="shield" size={28} />
      </span>
      <h2 className="consent__title">{t(`${i18nPrefix}.title`)}</h2>
      <p className="consent__body">{t(`${i18nPrefix}.body`)}</p>
      <div className="consent__actions">
        <Button block onClick={onAccept} disabled={submitting}>
          {t(`${i18nPrefix}.accept`)}
        </Button>
        <Button variant="ghost" block onClick={onDecline} disabled={submitting}>
          {t(`${i18nPrefix}.decline`)}
        </Button>
      </div>
    </div>
  );
}
