export interface CaptureFrameVideoLike {
  videoWidth: number;
  videoHeight: number;
}

export interface CaptureFrameContextLike {
  drawImage(source: CaptureFrameVideoLike, dx: number, dy: number, dw: number, dh: number): void;
  getImageData(sx: number, sy: number, sw: number, sh: number): {
    width: number;
    height: number;
    data: Uint8ClampedArray;
  };
}

export interface CaptureFrameCanvasLike {
  width: number;
  height: number;
  getContext(contextId: "2d"): CaptureFrameContextLike | null;
  toBlob(callback: (result: Blob | null) => void, type?: string, quality?: number): void;
}

export interface CapturedFrame {
  blob: Blob;
  imageData: { width: number; height: number; data: Uint8ClampedArray };
}

/** JPEG re-encode target (design Decision 15: "re-encode JPEG ... quality ~0.85"). */
const JPEG_MIME_TYPE = "image/jpeg";
const JPEG_QUALITY = 0.85;

/**
 * Draws the current video frame onto `canvas` and re-encodes it as a JPEG
 * blob (task 8.2, design Decision 15). Re-encoding through the canvas is
 * itself what strips EXIF/GPS metadata: a canvas's pixel buffer never
 * carries the source's metadata, so anything drawn onto it and re-exported
 * via `toBlob` comes out clean — no separate metadata-stripping step exists
 * or is needed.
 *
 * Takes structurally-typed `video`/`canvas` parameters (rather than the real
 * DOM `HTMLVideoElement`/`HTMLCanvasElement`) so this function is unit
 * testable without a real browser canvas implementation, the same
 * dependency-injection convention this codebase already uses for
 * non-deterministic infra (`AccessLinkStore`, `RateLimiter`, `QueueClient`).
 */
export async function captureFrame(
  video: CaptureFrameVideoLike,
  canvas: CaptureFrameCanvasLike,
): Promise<CapturedFrame> {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2D canvas context unavailable — cannot capture a frame");
  }

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const rawImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) {
          resolve(result);
        } else {
          reject(new Error("Canvas failed to produce a JPEG blob"));
        }
      },
      JPEG_MIME_TYPE,
      JPEG_QUALITY,
    );
  });

  return {
    blob,
    imageData: {
      width: rawImageData.width,
      height: rawImageData.height,
      data: rawImageData.data,
    },
  };
}
