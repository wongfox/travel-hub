import type { ApiClient } from "../../shared/api/client.js";
import type { MediaDevicesLike } from "./capture/camera-capture.js";
import { PrecheckinCaptureStep, type PrecheckinCaptureAccepted } from "./capture/precheckin-capture-step.js";
import type { PrecheckinCaptureRole } from "./capture/capture-role.js";
import { PrecheckinConsentGate } from "./consent/precheckin-consent-gate.js";

export interface PrecheckinCaptureFlowProps {
  role: PrecheckinCaptureRole;
  apiClient: ApiClient;
  consentTextVersion: string;
  onAccepted: (accepted: PrecheckinCaptureAccepted) => void;
  /** Injectable for tests; defaults to `navigator.mediaDevices`. */
  mediaDevices?: MediaDevicesLike;
}

/**
 * Composes `PrecheckinConsentGate` (task 8.1) with `PrecheckinCaptureStep`
 * (task 8.2) for one document role — the concrete integration proving the
 * spec's "consent required before camera access" holds end to end, not just
 * within each piece in isolation. Submission of the accepted blob to
 * `POST /api/precheckin/:passengerOrdinal` is task 8.3's scope; this
 * component only hands the accepted blob to its caller via `onAccepted`.
 */
export function PrecheckinCaptureFlow({
  role,
  apiClient,
  consentTextVersion,
  onAccepted,
  mediaDevices,
}: PrecheckinCaptureFlowProps) {
  return (
    <PrecheckinConsentGate apiClient={apiClient} consentTextVersion={consentTextVersion}>
      <PrecheckinCaptureStep role={role} onAccepted={onAccepted} {...(mediaDevices ? { mediaDevices } : {})} />
    </PrecheckinConsentGate>
  );
}
