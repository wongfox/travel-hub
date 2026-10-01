import { useTranslation } from "react-i18next";
import type { PulseScore } from "contracts";

export interface PulsePromptProps {
  onSubmit: (score: PulseScore) => void;
  /** Disables every face while a submission is already in flight (never double-submit). */
  isSubmitting: boolean;
}

const SCALE: PulseScore[] = [1, 2, 3, 4, 5];

/**
 * `experience-pulse`'s faces-scale prompt (task 11.6): one button per face
 * on the 1-5 scale (`PulseScoreSchema`). Purely presentational — the
 * container (`PulsePage`) owns submission, trigger-moment detection, and the
 * independent push-delivery request.
 */
export function PulsePrompt({ onSubmit, isSubmitting }: PulsePromptProps) {
  const { t } = useTranslation();

  return (
    <div role="group" aria-label={t("pulse.prompt.question")}>
      <p>{t("pulse.prompt.question")}</p>
      {SCALE.map((score) => (
        <button
          key={score}
          type="button"
          data-testid={`pulse-face-${score}`}
          disabled={isSubmitting}
          onClick={() => onSubmit(score)}
        >
          {t(`pulse.prompt.face${score}`)}
        </button>
      ))}
    </div>
  );
}
