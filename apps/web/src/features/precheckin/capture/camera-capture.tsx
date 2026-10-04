import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { captureFrame as defaultCaptureFrame, type CapturedFrame, type CaptureFrameCanvasLike, type CaptureFrameVideoLike } from "./capture-frame.js";
import type { PrecheckinCaptureRole } from "./capture-role.js";

export interface MediaStreamTrackLike {
  stop(): void;
}

export interface MediaStreamLike {
  getTracks(): MediaStreamTrackLike[];
}

export interface MediaDevicesLike {
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStreamLike>;
}

export interface CameraCaptureProps {
  role: PrecheckinCaptureRole;
  /** Injectable for tests; defaults to `navigator.mediaDevices`. */
  mediaDevices?: MediaDevicesLike;
  /** Injectable for tests; defaults to the real `captureFrame` (canvas-based JPEG re-encode). */
  captureFrame?: (video: CaptureFrameVideoLike, canvas: CaptureFrameCanvasLike) => Promise<CapturedFrame>;
  /** Injectable for tests; defaults to a real `<canvas>` element. */
  createCanvas?: () => CaptureFrameCanvasLike;
  onCaptured: (frame: CapturedFrame) => void;
  /** Called when the camera cannot be used at all (no API, or permission denied) — the caller falls back to file upload. */
  onUnavailable: () => void;
}

/**
 * `pre-check-in`'s live camera capture (task 8.2, design Decision 15): front
 * camera for the passenger's own photo, rear camera for an ID document.
 * Delegates the actual frame grab to `captureFrame` (injectable) so this
 * component's own orchestration — requesting the stream, showing the button
 * only once ready, falling back on denial/absence, releasing tracks on
 * unmount — is unit testable without a real browser camera or canvas.
 */
export function CameraCapture({
  role,
  mediaDevices,
  captureFrame = defaultCaptureFrame,
  createCanvas = () => document.createElement("canvas") as unknown as CaptureFrameCanvasLike,
  onCaptured,
  onUnavailable,
}: CameraCaptureProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStreamLike | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const devices =
      mediaDevices ??
      (typeof navigator !== "undefined" ? (navigator.mediaDevices as unknown as MediaDevicesLike) : undefined);

    if (typeof devices?.getUserMedia !== "function") {
      onUnavailable();
      return;
    }

    const facingMode = role === "photo" ? "user" : "environment";
    devices
      .getUserMedia({ video: { facingMode } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          (videoRef.current as unknown as { srcObject: unknown }).srcObject = stream;
        }
      })
      .catch(() => {
        if (!cancelled) {
          onUnavailable();
        }
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onUnavailable/onCaptured are expected to be stable per mount, matching this codebase's existing session/query hook convention.
  }, [role, mediaDevices]);

  async function handleCapture(): Promise<void> {
    if (!videoRef.current) return;
    const canvas = createCanvas();
    const frame = await captureFrame(videoRef.current as unknown as CaptureFrameVideoLike, canvas);
    onCaptured(frame);
  }

  return (
    <div
      data-testid={`camera-capture-${role}`}
      className={`camera camera--${role === "photo" ? "face" : "id"}`}
      data-ready={ready}
    >
      <div className="camera__frame">
        <video
          className="camera__video"
          ref={videoRef}
          autoPlay
          muted
          playsInline
          data-testid={`camera-video-${role}`}
          // Ready only once the first frame is decoded: before that `videoWidth` is 0 and a capture would draw an empty canvas.
          onLoadedData={() => setReady(true)}
        />
        <span className="camera__guide" aria-hidden="true" />
      </div>
      <div className="camera__bar">
        {ready && (
          <button type="button" className="camera__shutter" onClick={() => void handleCapture()}>
            <span className="visually-hidden">{t("precheckin.capture.captureButton")}</span>
          </button>
        )}
      </div>
    </div>
  );
}
