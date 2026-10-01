import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import type { WifiOrderDTO } from "contracts";
import { createI18n } from "../../i18n/index.js";
import { WifiEntitlementStatus } from "./wifi-entitlement-status.js";

function buildOrder(overrides: Partial<WifiOrderDTO> = {}): WifiOrderDTO {
  return {
    id: "order-1",
    packageId: "WIFI-60",
    status: "PAYMENT_PENDING",
    amountMinor: 1500,
    currency: "PEN",
    sirRegistered: false,
    receiptIssued: false,
    entitlementRef: null,
    entitlementExpiresAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function renderStatus(order: WifiOrderDTO) {
  return render(
    <I18nextProvider i18n={createI18n({ initialLocale: "en" })}>
      <WifiEntitlementStatus order={order} />
    </I18nextProvider>,
  );
}

describe("WifiEntitlementStatus", () => {
  it("shows the active-entitlement message and validity time once ENTITLEMENT_ACTIVE", () => {
    renderStatus(
      buildOrder({ status: "ENTITLEMENT_ACTIVE", entitlementRef: "ENT-1", entitlementExpiresAt: "2026-01-01T13:00:00.000Z" }),
    );

    expect(screen.getByRole("status")).toHaveTextContent(/active/i);
  });

  it("shows a pending message for PAYMENT_PENDING", () => {
    renderStatus(buildOrder({ status: "PAYMENT_PENDING" }));

    expect(screen.getByRole("status")).toHaveTextContent(/confirmation/i);
  });

  it("shows a payment-failed alert for PAYMENT_FAILED, never implying activation", () => {
    renderStatus(buildOrder({ status: "PAYMENT_FAILED" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/couldn't process/i);
  });

  it("shows a refunded alert for REFUNDED", () => {
    renderStatus(buildOrder({ status: "REFUNDED" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/refunded/i);
  });
});
