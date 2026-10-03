import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import type { AlertDTO } from "contracts";
import { createI18n } from "../../i18n/index.js";
import { RelocationAlerts } from "./relocation-alerts.js";

function buildAlert(overrides: Partial<AlertDTO> = {}): AlertDTO {
  return {
    id: "relocation:leg-1:2026-11-01T00:00:00.000Z",
    type: "RELOCATION",
    legId: "leg-1",
    titleKey: "alerts.relocation.title",
    bodyKey: "alerts.relocation.body",
    occurredAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("RelocationAlerts", () => {
  it("renders a banner for every alert, shown regardless of push subscription state", () => {
    render(
      <I18nextProvider i18n={createI18n({ initialLocale: "en" })}>
        <RelocationAlerts alerts={[buildAlert()]} />
      </I18nextProvider>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("You've been relocated");
  });

  it("renders one banner per alert when there are several", () => {
    render(
      <I18nextProvider i18n={createI18n({ initialLocale: "en" })}>
        <RelocationAlerts alerts={[buildAlert({ id: "a" }), buildAlert({ id: "b", legId: "leg-2" })]} />
      </I18nextProvider>,
    );

    expect(screen.getAllByRole("alert")).toHaveLength(2);
  });

  it("renders nothing when there are no alerts", () => {
    const { container } = render(
      <I18nextProvider i18n={createI18n({ initialLocale: "en" })}>
        <RelocationAlerts alerts={[]} />
      </I18nextProvider>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
