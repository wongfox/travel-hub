import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import type { NextMilestone, TicketDTO, TripLeg } from "contracts";
import { createI18n } from "../../i18n/index.js";
import { ItineraryTimeline } from "./itinerary-timeline.js";

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

function renderTimeline(props: {
  legs: TripLeg[];
  documents: TicketDTO[];
  nextMilestone: NextMilestone;
  now?: Date;
}) {
  return render(
    <I18nextProvider i18n={createI18n({ initialLocale: "en" })}>
      <ItineraryTimeline {...props} />
    </I18nextProvider>,
  );
}

describe("ItineraryTimeline", () => {
  it("renders one milestone per leg, ordered as received, with its status", () => {
    const legs = [
      buildLeg({ id: "leg-1", origin: "Poroy", destination: "Ollantaytambo", status: "COMPLETED" }),
      buildLeg({ id: "leg-2", origin: "Ollantaytambo", destination: "Machu Picchu", status: "SCHEDULED" }),
    ];
    const nextMilestone: NextMilestone = { legId: "leg-2", kind: "departure", atLocal: "2026-11-10T10:00:00" };

    renderTimeline({ legs, documents: [], nextMilestone, now: new Date("2026-11-10T09:00:00Z") });

    const milestones = screen.getAllByTestId("itinerary-milestone");
    expect(milestones).toHaveLength(2);
    expect(within(milestones[0]).getByText(/Poroy/)).toBeInTheDocument();
    expect(within(milestones[0]).getByText("Completed")).toBeInTheDocument();
    expect(within(milestones[1]).getByText("Next")).toBeInTheDocument();
  });

  it("associates each milestone with its documents (spec 'Ticket linked from itinerary entry')", () => {
    const legs = [buildLeg({ id: "leg-1" })];
    const documents: TicketDTO[] = [
      { id: "ticket-1", kind: "CONSETTUR", title: "Consettur bus", milestoneId: "leg-1", fileId: "DOC-1" },
    ];

    renderTimeline({ legs, documents, nextMilestone: null, now: new Date("2026-11-10T09:00:00Z") });

    const milestone = screen.getByTestId("itinerary-milestone");
    expect(within(milestone).getByText("Consettur bus")).toBeInTheDocument();
  });
});
