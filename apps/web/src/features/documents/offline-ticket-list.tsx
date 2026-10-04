import type { OfflineTicket } from "../../shared/offline/trip-snapshot.js";
import { TicketCard } from "./ticket-card.js";

export interface OfflineTicketListProps {
  tickets: OfflineTicket[];
}

/**
 * Offline counterpart of `TicketList` (task 7.1), rendered from a cached
 * `TripSnapshot`'s `tickets` array. `OfflineTicket` has no stable `id`
 * (design Data Model "Client-side": it mirrors the design's exact snapshot
 * shape, which drops `id`/`milestoneId` — see `trip-snapshot.ts`), so the
 * array index is used as the React key here; safe because this list is
 * re-rendered wholesale from a freshly read snapshot, never reordered or
 * spliced in place.
 */
export function OfflineTicketList({ tickets }: OfflineTicketListProps) {
  return (
    <ul className="stack">
      {tickets.map((ticket, index) => (
        <TicketCard
          key={index}
          testId="offline-ticket-item"
          kind={ticket.kind}
          title={ticket.title}
          barcodePayload={ticket.barcodePayload}
          fileId={ticket.fileId}
        />
      ))}
    </ul>
  );
}
