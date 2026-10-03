import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WifiPackageDTO } from "contracts";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../i18n/index.js";
import { WifiCatalog } from "./wifi-catalog.js";

const PACKAGES: WifiPackageDTO[] = [
  { id: "WIFI-60", code: "wifi-60", name: "WiFi 60 min", priceMinor: 1500, currency: "PEN", durationMinutes: 60 },
  { id: "WIFI-120", code: "wifi-120", name: "WiFi 120 min", priceMinor: 2500, currency: "PEN", durationMinutes: 120 },
];

function renderWithI18n(ui: React.ReactElement, initialLocale: "es" | "en" | "pt" = "en") {
  const i18n = createI18n({ initialLocale });
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

describe("WifiCatalog", () => {
  it("renders every package with its name and a buy action", () => {
    renderWithI18n(<WifiCatalog packages={PACKAGES} onBuy={vi.fn()} isBuying={false} />);

    expect(screen.getByText("WiFi 60 min")).toBeInTheDocument();
    expect(screen.getByText("WiFi 120 min")).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("calls onBuy with the package id when its buy button is clicked", async () => {
    const onBuy = vi.fn();
    renderWithI18n(<WifiCatalog packages={PACKAGES} onBuy={onBuy} isBuying={false} />);

    await userEvent.click(screen.getAllByRole("button")[0]!);

    expect(onBuy).toHaveBeenCalledWith("WIFI-60");
  });

  it("disables every buy button while a purchase is in flight (never double-submit)", () => {
    renderWithI18n(<WifiCatalog packages={PACKAGES} onBuy={vi.fn()} isBuying={true} />);

    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
  });

  it("formats prices with the active locale (es keeps es-PE soles, en does not)", () => {
    const { unmount } = renderWithI18n(<WifiCatalog packages={PACKAGES} onBuy={vi.fn()} isBuying={false} />, "es");
    expect(screen.getByText(/^S\/\s?15\.00$/)).toBeInTheDocument();
    unmount();

    renderWithI18n(<WifiCatalog packages={PACKAGES} onBuy={vi.fn()} isBuying={false} />, "en");
    expect(screen.queryAllByText(/S\//)).toHaveLength(0);
    expect(screen.getByText(/^PEN\s?15\.00$/)).toBeInTheDocument();
  });
});
