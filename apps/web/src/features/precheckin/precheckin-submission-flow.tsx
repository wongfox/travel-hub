import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DocumentTypeSchema, type DocumentType } from "contracts";
import { ApiError, type ApiClient } from "../../shared/api/client.js";
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
    return <p role="alert">{t("precheckin.submit.unavailable")}</p>;
  }

  if (!photo) {
    return (
      <PrecheckinCaptureStep
        key="photo"
        role="photo"
        onAccepted={handleAccepted}
        {...(mediaDevices ? { mediaDevices } : {})}
      />
    );
  }

  if (!idFront) {
    return (
      <PrecheckinCaptureStep
        key="id_front"
        role="id_front"
        onAccepted={handleAccepted}
        {...(mediaDevices ? { mediaDevices } : {})}
      />
    );
  }

  const submitting = submitState === "submitting";
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <label>
        {t("precheckin.submit.docTypeLabel")}
        <select
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
      {submitState === "error" && <p role="alert">{t("precheckin.submit.error")}</p>}
      <button type="submit" disabled={docType === "" || submitting}>
        {submitting ? t("precheckin.submit.submitting") : t("precheckin.submit.submit")}
      </button>
    </form>
  );
}
