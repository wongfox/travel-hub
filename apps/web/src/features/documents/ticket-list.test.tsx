import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import type { TicketDTO } from "contracts";
import { createI18n } from "../../i18n/index.js";
import { TicketList } from "./ticket-list.js";

function buildTicket(overrides: Partial<TicketDTO>): TicketDTO {
  return {
    id: "ticket-1",
    kind: "TRAIN",
    title: "Train Poroy → Machu Picchu",
    milestoneId: "leg-1",
    ...overrides,
  };
}

function renderList(tickets: TicketDTO[]) {
  return render(
    <I18nextProvider i18n={createI18n({ initialLocale: "en" })}>
      <TicketList documents={tickets} />
    </I18nextProvider>,
  );
}

describe("TicketList", () => {
  it("renders every purchased ticket type together (spec 'Multiple ticket types shown together')", () => {
    renderList([
      buildTicket({ id: "t1", kind: "TRAIN", barcodePayload: "BP-1" }),
      buildTicket({ id: "t2", kind: "INC_ENTRY", title: "Entry ticket #INC-42" }),
      buildTicket({ id: "t3", kind: "MEAL_TEATIME", title: "Tea time" }),
    ]);

    const items = screen.getAllByTestId("ticket-item");
    expect(items).toHaveLength(3);
    expect(within(items[1]).getByText("Entry ticket #INC-42")).toBeInTheDocument();
  });

  it("shows a barcode for a ticket that carries one", () => {
    renderList([buildTicket({ barcodePayload: "BP-1" })]);

    expect(screen.getByText(/BP-1/)).toBeInTheDocument();
  });

  it("links to GET /api/documents/:id for a ticket with a file, and nothing for one without", () => {
    renderList([
      buildTicket({ id: "t1", kind: "CONSETTUR", title: "Consettur bus", fileId: "DOC-1" }),
      buildTicket({ id: "t2", kind: "TRAIN", barcodePayload: "BP-1" }),
    ]);

    const link = screen.getByRole("link", { name: "View document" });
    expect(link).toHaveAttribute("href", "/api/documents/DOC-1");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});
