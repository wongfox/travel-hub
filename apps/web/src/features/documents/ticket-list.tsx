import { useTranslation } from "react-i18next";
import type { TicketDTO, TicketKind } from "contracts";

const KIND_LABEL_KEYS: Record<TicketKind, string> = {
  TRAIN: "documents.kind.train",
  CONSETTUR: "documents.kind.consettur",
  INC_ENTRY: "documents.kind.incEntry",
  MEAL_TEATIME: "documents.kind.mealTeatime",
  OTHER: "documents.kind.other",
};

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
  const { t } = useTranslation();

  return (
    <ul>
      {documents.map((document) => (
        <li key={document.id} data-testid="ticket-item">
          <p>{t(KIND_LABEL_KEYS[document.kind])}</p>
          <p>{document.title}</p>
          {document.barcodePayload && (
            <p>
              {t("documents.barcodeLabel")}: {document.barcodePayload}
            </p>
          )}
          {document.fileId && (
            <a href={`/api/documents/${document.fileId}`} target="_blank" rel="noreferrer">
              {t("documents.viewFile")}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
