import type { TicketDTO } from "contracts";
import { TicketCard } from "./ticket-card.js";

export interface TicketListProps {
  documents: TicketDTO[];
}

/**
 * `travel-documents`' ticket listing (spec "Multiple ticket types shown
 * together"). A ticket with `fileId` links directly to `GET
 * /api/documents/:id` — a same-origin, session-authenticated route the
 * browser fetches on click via a normal navigation, so no client-side blob
 * handling is needed for something the browser already does natively. A
 * ticket with `barcodePayload` (the train ticket, self-contained via the
 * boarding pass) shows its payload as text instead.
 */
export function TicketList({ documents }: TicketListProps) {
  return (
    <ul className="stack">
      {documents.map((document) => (
        <TicketCard
          key={document.id}
          testId="ticket-item"
          kind={document.kind}
          title={document.title}
          barcodePayload={document.barcodePayload}
          fileId={document.fileId}
        />
      ))}
    </ul>
  );
}
