import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DocumentTypeSchema, type DocumentType } from "contracts";
import { ApiError, type ApiClient } from "../../shared/api/client.js";
import { Alert } from "../../shared/ui/atoms/alert.js";
import { Button } from "../../shared/ui/atoms/button.js";
import type { MediaDevicesLike } from "./capture/camera-capture.js";
import { PrecheckinCaptureStep, type PrecheckinCaptureAccepted } from "./capture/precheckin-capture-step.js";
import { submitPrecheckin } from "./submit-precheckin.js";

export interface PrecheckinSubmissionFlowProps {
  apiClient: ApiClient;
  passengerOrdinal: number;
  /** From the consent gate; the flow never renders outside it. */
  consentRecordId: string;
  /** Re-asks for consent (BFF answered 403 `consent_required`). */
  onConsentRequired: () => void;
  onSubmitted: () => void;
  /** Injectable for tests; defaults to `navigator.mediaDevices`. */
  mediaDevices?: MediaDevicesLike;
}

/** Decorative three-step progress (photo, ID, details); the step headings carry the meaning. */
function StepDots({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol className="steps" aria-hidden="true">
      {[1, 2, 3].map((step) => (
        <li key={step} className="steps__dot" data-state={step < current ? "done" : step === current ? "current" : "todo"} />
      ))}
    </ol>
  );
}

type SubmitState = "idle" | "submitting" | "error" | "unavailable";

/**
 * Pre check-in capture -> submission for ONE passenger (tasks 8.2 + 8.3): the
 * photo, then the ID front (the two images the BFF requires; `id_back` is
 * optional there and not collected), then the document type, then the
 * multipart submit. Captured blobs live only in this component's state: a
 * failed submit keeps them so the passenger can retry without recapturing or
 * re-consenting (spec "Submission failure preserves passenger progress"), and
 * they are never logged, persisted or cached.
 *
 * TODO(legal): the `precheckin.submit.*` copy and the offered document types
 * are provisional (the accepted document set is a TBD open item in the spec).
 */
export function PrecheckinSubmissionFlow({
  apiClient,
  passengerOrdinal,
  consentRecordId,
  onConsentRequired,
  onSubmitted,
  mediaDevices,
}: PrecheckinSubmissionFlowProps) {
  const { t } = useTranslation();
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [idFront, setIdFront] = useState<Blob | null>(null);
  const [docType, setDocType] = useState<DocumentType | "">("");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");

  function handleAccepted(accepted: PrecheckinCaptureAccepted): void {
    if (accepted.role === "photo") setPhoto(accepted.blob);
    else if (accepted.role === "id_front") setIdFront(accepted.blob);
  }

  async function handleSubmit(): Promise<void> {
    if (!photo || !idFront || docType === "") return;
    setSubmitState("submitting");
    try {
      await submitPrecheckin(apiClient, { passengerOrdinal, docType, consentRecordId, photo, idFront });
      onSubmitted();
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === "already_submitted") {
          onSubmitted();
          return;
        }
        if (error.code === "consent_required") {
          onConsentRequired();
          return;
        }
        if (error.code === "feature_disabled") {
          setSubmitState("unavailable");
          return;
        }
      }
      setSubmitState("error");
    }
  }

  if (submitState === "unavailable") {
    return <Alert tone="error">{t("precheckin.submit.unavailable")}</Alert>;
  }

  if (!photo) {
    return (
      <div className="stack">
        <StepDots current={1} />
        <PrecheckinCaptureStep
          key="photo"
          role="photo"
          onAccepted={handleAccepted}
          {...(mediaDevices ? { mediaDevices } : {})}
        />
      </div>
    );
  }

  if (!idFront) {
    return (
      <div className="stack">
        <StepDots current={2} />
        <PrecheckinCaptureStep
          key="id_front"
          role="id_front"
          onAccepted={handleAccepted}
          {...(mediaDevices ? { mediaDevices } : {})}
        />
      </div>
    );
  }

  const submitting = submitState === "submitting";
  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <StepDots current={3} />
      <label className="field">
        <span className="field__label">{t("precheckin.submit.docTypeLabel")}</span>
        <select
          className="select"
          value={docType}
          onChange={(event) => setDocType(event.target.value as DocumentType | "")}
          disabled={submitting}
        >
          <option value="">{t("precheckin.submit.docTypeChoose")}</option>
          {DocumentTypeSchema.options.map((option) => (
            <option key={option} value={option}>
              {t(`precheckin.submit.docTypes.${option}`)}
            </option>
          ))}
        </select>
      </label>
      {submitState === "error" && <Alert tone="error">{t("precheckin.submit.error")}</Alert>}
      <Button type="submit" block disabled={docType === "" || submitting}>
        {submitting ? t("precheckin.submit.submitting") : t("precheckin.submit.submit")}
      </Button>
    </form>
  );
}
