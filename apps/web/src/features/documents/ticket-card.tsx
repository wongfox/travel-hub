import { useTranslation } from "react-i18next";
import type { TicketKind } from "contracts";
import { ButtonLink } from "../../shared/ui/atoms/button.js";
import { Icon } from "../../shared/ui/atoms/icon.js";

const KIND_LABEL_KEYS: Record<TicketKind, string> = {
  TRAIN: "documents.kind.train",
  CONSETTUR: "documents.kind.consettur",
  INC_ENTRY: "documents.kind.incEntry",
  MEAL_TEATIME: "documents.kind.mealTeatime",
  OTHER: "documents.kind.other",
};

export interface TicketCardProps {
  kind: TicketKind;
  title: string;
  barcodePayload?: string | undefined;
  fileId?: string | undefined;
  testId: string;
}

/**
 * One purchased ticket as a card (shared by the online and offline lists): the
 * kind as an eyebrow, the title in the display face, the barcode payload as a
 * monospace text block, and — when a file exists — a clear "view document"
 * action. A ticket with `fileId` links straight to `GET /api/documents/:id`, a
 * same-origin, session-authenticated route the browser opens natively.
 */
export function TicketCard({ kind, title, barcodePayload, fileId, testId }: TicketCardProps) {
  const { t } = useTranslation();

  return (
    <li className="ticket" data-testid={testId}>
      <p className="ticket__kind">{t(KIND_LABEL_KEYS[kind])}</p>
      <p className="ticket__title">{title}</p>
      {barcodePayload && (
        <p className="barcode-block">
          {t("documents.barcodeLabel")}: {barcodePayload}
        </p>
      )}
      {fileId && (
        <ButtonLink variant="primary" href={`/api/documents/${fileId}`} target="_blank" rel="noreferrer">
          {t("documents.viewFile")}
          <Icon name="external" size={18} />
        </ButtonLink>
      )}
    </li>
  );
}
