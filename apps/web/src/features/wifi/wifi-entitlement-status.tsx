import { useTranslation } from "react-i18next";
import type { WifiOrderDTO } from "contracts";

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
        <div role="status">
          <p>{t("wifi.orderStatus.active")}</p>
          {validUntil && <p>{t("wifi.orderStatus.activeUntil", { time: validUntil })}</p>}
        </div>
      );
    }
    case "PAID":
      return <p role="status">{t("wifi.orderStatus.paid")}</p>;
    case "CREATED":
    case "PAYMENT_PENDING":
      return <p role="status">{t("wifi.orderStatus.paymentPending")}</p>;
    case "PAYMENT_FAILED":
      return <p role="alert">{t("wifi.orderStatus.failed")}</p>;
    case "REFUND_PENDING":
    case "REFUNDED":
      return <p role="alert">{t("wifi.orderStatus.refunded")}</p>;
    default:
      return null;
  }
}
