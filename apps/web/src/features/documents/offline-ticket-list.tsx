import { useTranslation } from "react-i18next";
import type { TicketKind } from "contracts";
import type { OfflineTicket } from "../../shared/offline/trip-snapshot.js";

const KIND_LABEL_KEYS: Record<TicketKind, string> = {
  TRAIN: "documents.kind.train",
  CONSETTUR: "documents.kind.consettur",
  INC_ENTRY: "documents.kind.incEntry",
  MEAL_TEATIME: "documents.kind.mealTeatime",
  OTHER: "documents.kind.other",
};

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
  const { t } = useTranslation();

  return (
    <ul>
      {tickets.map((ticket, index) => (
        <li key={index} data-testid="offline-ticket-item">
          <p>{t(KIND_LABEL_KEYS[ticket.kind])}</p>
          <p>{ticket.title}</p>
          {ticket.barcodePayload && (
            <p>
              {t("documents.barcodeLabel")}: {ticket.barcodePayload}
            </p>
          )}
          {ticket.fileId && (
            <a href={`/api/documents/${ticket.fileId}`} target="_blank" rel="noreferrer">
              {t("documents.viewFile")}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
