import { useTranslation } from "react-i18next";
import type { BoardingPassDTO, TripLeg } from "contracts";
import { formatLocalDateTime } from "../../shared/format/format-local-datetime.js";
import { Badge } from "../../shared/ui/atoms/badge.js";
import type { MilestoneStatus } from "./resolve-milestone-status.js";

const STATUS_LABEL_KEYS: Record<MilestoneStatus, string> = {
  pending: "itinerary.status.pending",
  next: "itinerary.status.next",
  in_progress: "itinerary.status.inProgress",
  completed: "itinerary.status.completed",
};

export interface BoardingPassCardProps {
  leg: TripLeg;
  status: MilestoneStatus;
  /** The leg's boarding pass, when the trip carries one (seat, coach, barcode). */
  boardingPass?: BoardingPassDTO | undefined;
  /** Titles of the documents linked to this leg (online timeline only). */
  documentTitles?: string[];
  testId: string;
}

/**
 * One itinerary leg rendered as a boarding pass: a tier-colored hero with the
 * route (Playfair), times and status, then a perforated stub with seat, coach
 * and the barcode payload as text. Shared by the online and offline timelines
 * so both stay visually identical; the tier color arrives only through the
 * theme's CSS variables, never through a tier branch here.
 */
export function BoardingPassCard({ leg, status, boardingPass, documentTitles = [], testId }: BoardingPassCardProps) {
  const { t, i18n } = useTranslation();
  const hasStub = boardingPass !== undefined || documentTitles.length > 0;

  return (
    <li className="boarding-pass" data-testid={testId}>
      <div className="boarding-pass__hero">
        <div className="boarding-pass__top">
          <span>{t("itinerary.boardingPass")}</span>
          <Badge tone="accent">{t(STATUS_LABEL_KEYS[status])}</Badge>
        </div>
        <p className="boarding-pass__route">
          <span className="boarding-pass__city">{leg.origin}</span>
          <span className="visually-hidden"> → </span>
          <span className="boarding-pass__line" aria-hidden="true" />
          <span className="boarding-pass__city">{leg.destination}</span>
        </p>
        <div className="boarding-pass__facts">
          <p className="fact">
            <span className="fact__label">{t("itinerary.departs")}</span>
            <span className="boarding-pass__time">{formatLocalDateTime(leg.departureLocal, i18n.language)}</span>
          </p>
          <p className="fact">
            <span className="fact__label">{t("itinerary.arrives")}</span>
            <span className="boarding-pass__time">{formatLocalDateTime(leg.arrivalLocal, i18n.language)}</span>
          </p>
        </div>
      </div>
      {hasStub && (
        <div className="boarding-pass__stub">
          {boardingPass && (
            <>
              <div className="boarding-pass__facts">
                <p className="fact">
                  <span className="fact__label">{t("itinerary.seat")}</span>
                  <span className="fact__value">{boardingPass.seat}</span>
                </p>
                <p className="fact">
                  <span className="fact__label">{t("itinerary.coach")}</span>
                  <span className="fact__value">{boardingPass.coach}</span>
                </p>
              </div>
              <div className="barcode-block">
                <span className="barcode-block__label">{t("documents.barcodeLabel")}</span>
                {boardingPass.barcodePayload}
              </div>
            </>
          )}
          {documentTitles.length > 0 && (
            <ul className="boarding-pass__docs">
              {documentTitles.map((title, index) => (
                <li key={index}>{title}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
