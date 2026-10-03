import { describe, expect, it, vi } from "vitest";
import { captureFrame, type CaptureFrameCanvasLike, type CaptureFrameVideoLike } from "./capture-frame.js";

function buildFakeCanvas(imageData: unknown, blob: Blob | null): CaptureFrameCanvasLike {
  const drawImage = vi.fn();
  const getImageData = vi.fn().mockReturnValue(imageData);
  return {
    width: 0,
    height: 0,
    getContext: vi.fn().mockReturnValue({ drawImage, getImageData }),
    toBlob: vi.fn((callback: (result: Blob | null) => void) => {
      callback(blob);
    }),
  } as unknown as CaptureFrameCanvasLike;
}

describe("captureFrame", () => {
  it("sizes the canvas to the video's intrinsic dimensions and draws the current frame onto it", async () => {
    const fakeBlob = new Blob(["jpeg-bytes"], { type: "image/jpeg" });
    const canvas = buildFakeCanvas({ width: 640, height: 480, data: new Uint8ClampedArray(4) }, fakeBlob);
    const video: CaptureFrameVideoLike = { videoWidth: 640, videoHeight: 480 };

    await captureFrame(video, canvas);

    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(480);
    const ctx = canvas.getContext("2d")!;
    expect(ctx.drawImage).toHaveBeenCalledWith(video, 0, 0, 640, 480);
  });

  it("re-encodes the frame as a JPEG blob (which inherently strips EXIF/GPS — canvas never carries source metadata)", async () => {
    const fakeBlob = new Blob(["jpeg-bytes"], { type: "image/jpeg" });
    const canvas = buildFakeCanvas({ width: 640, height: 480, data: new Uint8ClampedArray(4) }, fakeBlob);
    const video: CaptureFrameVideoLike = { videoWidth: 640, videoHeight: 480 };

    const result = await captureFrame(video, canvas);

    expect(result.blob).toBe(fakeBlob);
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.85);
  });

  it("returns the raw pixel data alongside the blob, for the caller's quality check", async () => {
    const pixelData = new Uint8ClampedArray([1, 2, 3, 255]);
    const canvas = buildFakeCanvas(
      { width: 1, height: 1, data: pixelData },
      new Blob([], { type: "image/jpeg" }),
    );
    const video: CaptureFrameVideoLike = { videoWidth: 1, videoHeight: 1 };

    const result = await captureFrame(video, canvas);

    expect(result.imageData).toEqual({ width: 1, height: 1, data: pixelData });
  });

  it("rejects when the canvas has no 2D context", async () => {
    const canvas: CaptureFrameCanvasLike = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(null),
      toBlob: vi.fn(),
    } as unknown as CaptureFrameCanvasLike;
    const video: CaptureFrameVideoLike = { videoWidth: 100, videoHeight: 100 };

    await expect(captureFrame(video, canvas)).rejects.toThrow(/2D canvas context/);
  });

  it("rejects when the canvas fails to produce a blob", async () => {
    const canvas = buildFakeCanvas({ width: 10, height: 10, data: new Uint8ClampedArray(4) }, null);
    const video: CaptureFrameVideoLike = { videoWidth: 10, videoHeight: 10 };

    await expect(captureFrame(video, canvas)).rejects.toThrow(/failed to produce/i);
  });
});
