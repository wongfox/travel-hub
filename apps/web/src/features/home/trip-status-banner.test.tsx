import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import type { NextMilestone, TripLeg } from "contracts";
import { createI18n } from "../../i18n/index.js";
import { TripStatusBanner } from "./trip-status-banner.js";

function buildLeg(overrides: Partial<TripLeg>): TripLeg {
  return {
    id: "leg-1",
    origin: "Poroy",
    destination: "Machu Picchu",
    departureLocal: "2026-11-10T08:00:00",
    arrivalLocal: "2026-11-10T11:30:00",
    tier: "VOYAGER",
    status: "SCHEDULED",
    ...overrides,
  };
}

function renderBanner(props: { status: "upcoming" | "in_progress" | "completed"; nextMilestone: NextMilestone; legs: TripLeg[] }) {
  return render(
    <I18nextProvider i18n={createI18n({ initialLocale: "en" })}>
      <TripStatusBanner {...props} />
    </I18nextProvider>,
  );
}

describe("TripStatusBanner", () => {
  it("renders the upcoming status and the next milestone's origin/destination/time", () => {
    const legs = [buildLeg({ id: "leg-1", origin: "Poroy", destination: "Machu Picchu" })];
    const nextMilestone: NextMilestone = { legId: "leg-1", kind: "departure", atLocal: "2026-11-10T08:00:00" };

    renderBanner({ status: "upcoming", nextMilestone, legs });

    expect(screen.getByTestId("trip-status")).toHaveTextContent("Upcoming trip");
    expect(screen.getByTestId("next-milestone")).toHaveTextContent("Poroy");
    expect(screen.getByTestId("next-milestone")).toHaveTextContent("Machu Picchu");
  });

  it("renders the in-progress status label", () => {
    renderBanner({
      status: "in_progress",
      nextMilestone: { legId: "leg-1", kind: "departure", atLocal: "2026-11-10T08:00:00" },
      legs: [buildLeg({})],
    });

    expect(screen.getByTestId("trip-status")).toHaveTextContent("Trip in progress");
  });

  it("shows a trip-complete message instead of a stale or missing next-milestone module when there is none", () => {
    renderBanner({ status: "completed", nextMilestone: null, legs: [buildLeg({ status: "COMPLETED" })] });

    expect(screen.getByTestId("trip-status")).toHaveTextContent("Trip complete");
    expect(screen.getByTestId("next-milestone")).toHaveTextContent("Your trip is complete");
  });
});
