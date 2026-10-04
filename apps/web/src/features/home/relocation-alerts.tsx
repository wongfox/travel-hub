import { useTranslation } from "react-i18next";
import type { AlertDTO } from "contracts";
import { Alert } from "../../shared/ui/atoms/alert.js";

export interface RelocationAlertsProps {
  alerts: AlertDTO[];
}

/**
 * `trip-home`'s relocation/incident banner (spec "baseline channel"):
 * renders every entry in `TripDTO.alerts[]` unconditionally — the spec
 * requires this banner shown "regardless of push subscription state" and as
 * "the sole channel for a link-only, non-push passenger", so this component
 * never consults push state at all, it just renders what the BFF already
 * decided belongs in the banner.
 */
export function RelocationAlerts({ alerts }: RelocationAlertsProps) {
  const { t } = useTranslation();

  return (
    <>
      {alerts.map((alert) => (
        <Alert key={alert.id} tone="warning" role="alert" testId="relocation-alert">
          <p className="alert__title">{t(alert.titleKey)}</p>
          <p>{t(alert.bodyKey)}</p>
        </Alert>
      ))}
    </>
  );
}
