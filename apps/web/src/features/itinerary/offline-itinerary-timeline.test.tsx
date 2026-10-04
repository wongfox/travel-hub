import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import type { BoardingPassDTO, TripLeg } from "contracts";
import { createI18n } from "../../i18n/index.js";
import { OfflineItineraryTimeline } from "./offline-itinerary-timeline.js";

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

function renderTimeline(legs: TripLeg[], now?: Date, boardingPasses?: BoardingPassDTO[]) {
  return render(
    <I18nextProvider i18n={createI18n({ initialLocale: "en" })}>
      <OfflineItineraryTimeline legs={legs} now={now} boardingPasses={boardingPasses} />
    </I18nextProvider>,
  );
}

describe("OfflineItineraryTimeline", () => {
  it("renders one entry per cached leg with its origin, destination, and status", () => {
    const legs = [
      buildLeg({ id: "leg-1", origin: "Poroy", destination: "Ollantaytambo", status: "COMPLETED" }),
      buildLeg({ id: "leg-2", origin: "Ollantaytambo", destination: "Machu Picchu", status: "SCHEDULED" }),
    ];

    renderTimeline(legs, new Date("2026-11-09T00:00:00Z"));

    const items = screen.getAllByTestId("offline-itinerary-milestone");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Poroy");
    expect(items[0]).toHaveTextContent("Ollantaytambo");
    expect(items[0]).toHaveTextContent("Completed");
    expect(items[1]).toHaveTextContent("Machu Picchu");
  });

  it("renders no entries when there are no cached legs", () => {
    renderTimeline([]);

    expect(screen.queryAllByTestId("offline-itinerary-milestone")).toHaveLength(0);
  });

  it("renders the cached boarding pass seat, coach and barcode for its leg", () => {
    renderTimeline([buildLeg({ id: "leg-1" })], new Date("2026-11-09T00:00:00Z"), [
      { legId: "leg-1", barcodeFormat: "QR", barcodePayload: "BP-OFFLINE", seat: "7B", coach: "A", tier: "VOYAGER" },
    ]);

    const item = screen.getByTestId("offline-itinerary-milestone");
    expect(item).toHaveTextContent("7B");
    expect(item).toHaveTextContent("BP-OFFLINE");
  });
});
