import { useTranslation } from "react-i18next";
import type { WifiOrderDTO } from "contracts";
import { StatusPanel } from "../../shared/ui/atoms/status-panel.js";

export interface WifiEntitlementStatusProps {
  order: WifiOrderDTO;
}

/**
 * Active-entitlement status/validity display (task 10.4): one line per
 * saga/failure state the return-URL landing view can observe. Never
 * invents a "success" state from the gateway return alone — only ever
 * reflects `order.status` as last read from `GET /api/wifi/orders/:id`
 * (design Decision 8: the webhook, not the return URL, is authoritative).
 */
export function WifiEntitlementStatus({ order }: WifiEntitlementStatusProps) {
  const { t, i18n } = useTranslation();

  switch (order.status) {
    case "ENTITLEMENT_ACTIVE": {
      const validUntil = order.entitlementExpiresAt
        ? new Intl.DateTimeFormat(i18n.language, { timeStyle: "short" }).format(new Date(order.entitlementExpiresAt))
        : null;
      return (
        <StatusPanel tone="success" role="status">
          <p>{t("wifi.orderStatus.active")}</p>
          {validUntil && <p>{t("wifi.orderStatus.activeUntil", { time: validUntil })}</p>}
        </StatusPanel>
      );
    }
    case "PAID":
      return (
        <StatusPanel tone="pending" role="status">
          <p>{t("wifi.orderStatus.paid")}</p>
        </StatusPanel>
      );
    case "CREATED":
    case "PAYMENT_PENDING":
      return (
        <StatusPanel tone="pending" role="status">
          <p>{t("wifi.orderStatus.paymentPending")}</p>
        </StatusPanel>
      );
    case "PAYMENT_FAILED":
      return (
        <StatusPanel tone="error" role="alert">
          <p>{t("wifi.orderStatus.failed")}</p>
        </StatusPanel>
      );
    case "REFUND_PENDING":
    case "REFUNDED":
      return (
        <StatusPanel tone="error" role="alert">
          <p>{t("wifi.orderStatus.refunded")}</p>
        </StatusPanel>
      );
    default:
      return null;
  }
}
