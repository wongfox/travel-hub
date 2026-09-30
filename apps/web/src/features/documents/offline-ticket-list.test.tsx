import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../i18n/index.js";
import { OfflineTicketList } from "./offline-ticket-list.js";
import type { OfflineTicket } from "../../shared/offline/trip-snapshot.js";

function renderList(tickets: OfflineTicket[]) {
  return render(
    <I18nextProvider i18n={createI18n({ initialLocale: "en" })}>
      <OfflineTicketList tickets={tickets} />
    </I18nextProvider>,
  );
}

describe("OfflineTicketList", () => {
  it("renders one entry per cached ticket with its kind label and title", () => {
    const tickets: OfflineTicket[] = [
      { kind: "TRAIN", title: "Train ticket", barcodePayload: "payload-1" },
      { kind: "INC_ENTRY", title: "Entry ticket", fileId: "file-2" },
    ];

    renderList(tickets);

    const items = screen.getAllByTestId("offline-ticket-item");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Train ticket");
    expect(items[1]).toHaveTextContent("Entry ticket");
  });

  it("shows the barcode payload as text when present, and a file link when a fileId is present", () => {
    const tickets: OfflineTicket[] = [
      { kind: "TRAIN", title: "Train ticket", barcodePayload: "payload-xyz" },
      { kind: "INC_ENTRY", title: "Entry ticket", fileId: "file-42" },
    ];

    renderList(tickets);

    expect(screen.getByText(/payload-xyz/)).toBeInTheDocument();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/api/documents/file-42");
  });

  it("renders no entries when there are no cached tickets", () => {
    renderList([]);

    expect(screen.queryAllByTestId("offline-ticket-item")).toHaveLength(0);
  });
});
