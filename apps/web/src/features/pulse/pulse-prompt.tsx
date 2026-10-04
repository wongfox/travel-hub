import { useTranslation } from "react-i18next";
import type { PulseScore } from "contracts";

export interface PulsePromptProps {
  onSubmit: (score: PulseScore) => void;
  /** Disables every face while a submission is already in flight (never double-submit). */
  isSubmitting: boolean;
}

const SCALE: PulseScore[] = [1, 2, 3, 4, 5];

/** Mouth curve per score on a 40x40 face: frown (1) through neutral (3) to a broad smile (5). */
const MOUTH: Record<PulseScore, string> = {
  1: "M13 29q7-9 14 0",
  2: "M14 28q6-5 12 0",
  3: "M14 26h12",
  4: "M14 25q6 5 12 0",
  5: "M13 23q7 10 14 0Z",
};

/** Decorative face (the button's text label carries the meaning). */
function FaceIcon({ score }: { score: PulseScore }) {
  return (
    <svg
      className="pulse__icon"
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="20" cy="20" r="17" />
      <path d="M14.5 15.5v.01M25.5 15.5v.01" strokeWidth="3" />
      <path d={MOUTH[score]} />
    </svg>
  );
}

/**
 * `experience-pulse`'s faces-scale prompt (task 11.6): one button per face
 * on the 1-5 scale (`PulseScoreSchema`). Purely presentational — the
 * container (`PulsePage`) owns submission, trigger-moment detection, and the
 * independent push-delivery request.
 */
export function PulsePrompt({ onSubmit, isSubmitting }: PulsePromptProps) {
  const { t } = useTranslation();

  return (
    <div role="group" aria-label={t("pulse.prompt.question")} className="pulse">
      <p className="pulse__question">{t("pulse.prompt.question")}</p>
      <div className="pulse__scale">
        {SCALE.map((score) => (
          <button
            key={score}
            type="button"
            className="pulse__face"
            data-testid={`pulse-face-${score}`}
            disabled={isSubmitting}
            onClick={() => onSubmit(score)}
          >
            <FaceIcon score={score} />
            <span className="pulse__label">{t(`pulse.prompt.face${score}`)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
