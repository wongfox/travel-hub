import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import type { TripDTO } from "contracts";
import { createI18n } from "../../i18n/index.js";
import { ServicesGrid } from "./services-grid.js";

function renderGrid(trip: Pick<TripDTO, "features" | "consentTextVersions">) {
  return render(
    <I18nextProvider i18n={createI18n({ initialLocale: "en" })}>
      <ServicesGrid trip={trip} />
    </I18nextProvider>,
  );
}

describe("ServicesGrid", () => {
  it("renders a labelled link card per enabled service with its short description", () => {
    renderGrid({ features: { menuEnabled: true, wifiCheckout: true } as TripDTO["features"] });

    expect(screen.getByRole("heading", { name: "Services" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Help/ })).toHaveAttribute("href", "/trip/help");
    expect(screen.getByRole("link", { name: /^Menu/ })).toHaveAttribute("href", "/trip/menu");
    expect(screen.getByRole("link", { name: /^WiFi/ })).toHaveAttribute("href", "/trip/wifi");
    expect(screen.queryByRole("link", { name: /^Destination/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Notifications/ })).not.toBeInTheDocument();
  });

  it("never links the screens already on the tab bar", () => {
    renderGrid({ features: { precheckinCaptureUi: true } as TripDTO["features"], consentTextVersions: { precheckin: "v1" } });

    expect(screen.queryByRole("link", { name: /check-in/i })).not.toBeInTheDocument();
  });
});
