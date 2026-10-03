import { useTranslation } from "react-i18next";
import type { AlertDTO } from "contracts";

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
        <div key={alert.id} role="alert" data-testid="relocation-alert">
          <p>{t(alert.titleKey)}</p>
          <p>{t(alert.bodyKey)}</p>
        </div>
      ))}
    </>
  );
}
