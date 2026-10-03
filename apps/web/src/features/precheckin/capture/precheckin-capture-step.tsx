import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CameraCapture, type MediaDevicesLike } from "./camera-capture.js";
import { FileUploadFallback } from "./file-upload-fallback.js";
import {
  computeImageQuality as defaultComputeImageQuality,
  type QualityIssue,
} from "./compute-image-quality.js";
import type { CapturedFrame, CaptureFrameCanvasLike, CaptureFrameVideoLike } from "./capture-frame.js";
import type { PrecheckinCaptureRole } from "./capture-role.js";
import { isCameraAvailable } from "./is-camera-available.js";

export interface PrecheckinCaptureAccepted {
  role: PrecheckinCaptureRole;
  blob: Blob;
}

export interface PrecheckinCaptureStepProps {
  role: PrecheckinCaptureRole;
  /** Injectable for tests; defaults to `navigator.mediaDevices`. */
  mediaDevices?: MediaDevicesLike;
  captureFrame?: (video: CaptureFrameVideoLike, canvas: CaptureFrameCanvasLike) => Promise<CapturedFrame>;
  computeImageQuality?: (image: CapturedFrame["imageData"]) => { ok: boolean; reasons: QualityIssue[] };
  createCanvas?: () => CaptureFrameCanvasLike;
  onAccepted: (accepted: PrecheckinCaptureAccepted) => void;
}

type CaptureMode = "camera" | "fallback";

/**
 * `pre-check-in` capture orchestration (task 8.2): picks the live camera
 * path when available, falls back to file upload otherwise (spec "Camera
 * unavailable, fallback used"), and gates every camera-captured frame
 * through the client-side quality check (spec "Blurred or unreadable image
 * rejected") before accepting it. A file selected through the fallback is
 * accepted directly — see `compute-image-quality.ts`'s module doc for why
 * pixel-level quality checks are scoped to the camera path in this task.
 *
 * Never rendered except from behind `PrecheckinConsentGate` — this component
 * itself does not know about consent, matching this module set's existing
 * "session resolves identity, a separate concern resolves consent" layering.
 */
export function PrecheckinCaptureStep({
  role,
  mediaDevices,
  captureFrame,
  computeImageQuality = defaultComputeImageQuality,
  createCanvas,
  onAccepted,
}: PrecheckinCaptureStepProps) {
  const { t } = useTranslation();
  const resolvedMediaDevices =
    mediaDevices ??
    (typeof navigator !== "undefined" ? (navigator.mediaDevices as unknown as MediaDevicesLike) : undefined);
  const [mode, setMode] = useState<CaptureMode>(
    isCameraAvailable(resolvedMediaDevices) ? "camera" : "fallback",
  );
  const [rejection, setRejection] = useState<QualityIssue[] | null>(null);
  // Remounts CameraCapture for a fresh getUserMedia + a clean "ready" state on re-capture.
  const [cameraInstance, setCameraInstance] = useState(0);

  function handleCaptured(frame: CapturedFrame): void {
    const result = computeImageQuality(frame.imageData);
    if (result.ok) {
      setRejection(null);
      onAccepted({ role, blob: frame.blob });
    } else {
      setRejection(result.reasons);
      setCameraInstance((value) => value + 1);
    }
  }

  function handleFileSelected(file: File): void {
    onAccepted({ role, blob: file });
  }

  return (
    <div>
      <h3>{t(`precheckin.capture.roles.${role}`)}</h3>
      {rejection && (
        <p role="alert">
          {t("precheckin.capture.recapturePrompt")}{" "}
          {rejection.map((reason) => t(`precheckin.capture.qualityIssues.${reason}`)).join(" ")}
        </p>
      )}
      {mode === "camera" ? (
        <CameraCapture
          key={cameraInstance}
          role={role}
          onCaptured={handleCaptured}
          onUnavailable={() => setMode("fallback")}
          {...(mediaDevices ? { mediaDevices } : {})}
          {...(captureFrame ? { captureFrame } : {})}
          {...(createCanvas ? { createCanvas } : {})}
        />
      ) : (
        <FileUploadFallback role={role} onFileSelected={handleFileSelected} />
      )}
    </div>
  );
}
