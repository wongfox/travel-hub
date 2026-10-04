import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../../i18n/index.js";
import { TripTabBar } from "./trip-tab-bar.js";

function renderBar(props: Parameters<typeof TripTabBar>[0]) {
  return render(
    <I18nextProvider i18n={createI18n({ initialLocale: "en" })}>
      <TripTabBar {...props} />
    </I18nextProvider>,
  );
}

describe("TripTabBar", () => {
  it("links to the trip home, itinerary and documents screens", () => {
    renderBar({ current: "home" });

    expect(screen.getByRole("link", { name: "Trip" })).toHaveAttribute("href", "/trip");
    expect(screen.getByRole("link", { name: "Itinerary" })).toHaveAttribute("href", "/trip/itinerary");
    expect(screen.getByRole("link", { name: "Documents" })).toHaveAttribute("href", "/trip/documents");
  });

  it("marks only the current tab with aria-current=page", () => {
    renderBar({ current: "itinerary" });

    expect(screen.getByRole("link", { name: "Itinerary" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Trip" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Documents" })).not.toHaveAttribute("aria-current");
  });

  it("adds the pre check-in tab only when requested", () => {
    const { unmount } = renderBar({ current: "home" });
    expect(screen.queryByRole("link", { name: "Pre check-in" })).not.toBeInTheDocument();
    unmount();

    renderBar({ current: "home", showPrecheckin: true });
    expect(screen.getByRole("link", { name: "Pre check-in" })).toHaveAttribute("href", "/trip/precheckin");
  });

  it("marks no tab as current on secondary screens (current=null)", () => {
    renderBar({ current: null });

    for (const name of ["Trip", "Itinerary", "Documents"]) {
      expect(screen.getByRole("link", { name })).not.toHaveAttribute("aria-current");
    }
  });
});
