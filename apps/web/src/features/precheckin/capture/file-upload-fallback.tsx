import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../../shared/ui/atoms/icon.js";
import type { PrecheckinCaptureRole } from "./capture-role.js";

export interface FileUploadFallbackProps {
  role: PrecheckinCaptureRole;
  onFileSelected: (file: File) => void;
}

/**
 * `pre-check-in`'s file-upload fallback (task 8.2, spec "Camera unavailable,
 * fallback used"): a plain `<input type="file" capture>` for browsers/webviews
 * that block `getUserMedia` (design Decision 15). The `capture` attribute is
 * only a hint some mobile browsers use to preselect the matching camera app —
 * it never gates whether the fallback itself is shown; `PrecheckinCaptureStep`
 * decides that via `isCameraAvailable`/`onUnavailable`.
 */
export function FileUploadFallback({ role, onFileSelected }: FileUploadFallbackProps) {
  const { t } = useTranslation();
  const captureHint = role === "photo" ? "user" : "environment";

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (file) {
      onFileSelected(file);
    }
  }

  return (
    <label className="upload">
      <span className="upload__icon">
        <Icon name="upload" size={28} />
      </span>
      <span className="upload__label">{t(`precheckin.capture.fallbackLabel.${role}`)}</span>
      <input
        className="upload__input"
        type="file"
        accept="image/*"
        capture={captureHint}
        data-testid={`precheckin-file-fallback-${role}`}
        onChange={handleChange}
      />
    </label>
  );
}
