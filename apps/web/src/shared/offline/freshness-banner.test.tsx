import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../i18n/index.js";
import { FreshnessBanner } from "./freshness-banner.js";

function renderWithLocale(locale: "es" | "en", fetchedAt: string) {
  return render(
    <I18nextProvider i18n={createI18n({ initialLocale: locale })}>
      <FreshnessBanner fetchedAt={fetchedAt} />
    </I18nextProvider>,
  );
}

describe("FreshnessBanner", () => {
  it("renders a status role announcing when the cached data was last fetched", () => {
    renderWithLocale("en", "2026-09-30T12:00:00.000Z");

    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent("Last updated");
  });

  it("localizes the label per the active language", () => {
    renderWithLocale("es", "2026-09-30T12:00:00.000Z");

    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent("Última actualización");
  });
});
