import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../../i18n/index.js";
import { PrecheckinCaptureStep } from "./precheckin-capture-step.js";
import type { MediaDevicesLike } from "./camera-capture.js";
import type { CapturedFrame } from "./capture-frame.js";

afterEach(() => {
  cleanup();
});

function renderStep(options: {
  mediaDevices: MediaDevicesLike;
  captureFrame?: () => Promise<CapturedFrame>;
  computeImageQuality?: (image: unknown) => { ok: boolean; reasons: string[] };
  onAccepted?: (input: { role: "photo" | "id_front" | "id_back"; blob: Blob }) => void;
}) {
  const onAccepted = options.onAccepted ?? vi.fn();
  render(
    <I18nextProvider i18n={createI18n({ initialLocale: "en" })}>
      <PrecheckinCaptureStep
        role="photo"
        mediaDevices={options.mediaDevices}
        onAccepted={onAccepted}
        {...(options.captureFrame ? { captureFrame: options.captureFrame } : {})}
        {...(options.computeImageQuality ? { computeImageQuality: options.computeImageQuality } : {})}
        createCanvas={() => ({}) as never}
      />
    </I18nextProvider>,
  );
  return { onAccepted };
}

function buildStream() {
  return { getTracks: () => [{ stop: vi.fn() }] };
}

const GOOD_FRAME: CapturedFrame = {
  blob: new Blob(["jpeg"], { type: "image/jpeg" }),
  imageData: { width: 512, height: 512, data: new Uint8ClampedArray(4) },
};

describe("PrecheckinCaptureStep", () => {
  it("renders the camera capture UI when a camera is available", async () => {
    const getUserMedia = vi.fn().mockResolvedValue(buildStream());
    renderStep({ mediaDevices: { getUserMedia } });

    expect(await screen.findByTestId("camera-capture-photo")).toBeInTheDocument();
  });

  it("falls back to the file upload UI when no camera API exists at all", async () => {
    renderStep({ mediaDevices: {} });

    expect(await screen.findByTestId("precheckin-file-fallback-photo")).toBeInTheDocument();
  });

  it("falls back to the file upload UI when the camera stream is denied at runtime", async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new Error("denied"));
    renderStep({ mediaDevices: { getUserMedia } });

    expect(await screen.findByTestId("precheckin-file-fallback-photo")).toBeInTheDocument();
  });

  it("accepts a captured frame that passes the quality check", async () => {
    const user = userEvent.setup();
    const getUserMedia = vi.fn().mockResolvedValue(buildStream());
    const captureFrame = vi.fn().mockResolvedValue(GOOD_FRAME);
    // `computeImageQuality` itself is unit tested in `compute-image-quality.test.ts`
    // against real pixel data; here it is stubbed so this test only exercises
    // this component's own accept/reject wiring.
    const computeImageQuality = vi.fn().mockReturnValue({ ok: true, reasons: [] });
    const { onAccepted } = renderStep({
      mediaDevices: { getUserMedia },
      captureFrame,
      computeImageQuality,
    });

    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    fireEvent.loadedData(await screen.findByTestId("camera-video-photo"));
    await user.click(await screen.findByRole("button", { name: "Capture" }));

    await waitFor(() =>
      expect(onAccepted).toHaveBeenCalledWith({ role: "photo", blob: GOOD_FRAME.blob }),
    );
  });

  it("rejects a captured frame that fails the quality check and offers a re-capture prompt instead of accepting it", async () => {
    const user = userEvent.setup();
    const getUserMedia = vi.fn().mockResolvedValue(buildStream());
    const captureFrame = vi.fn().mockResolvedValue(GOOD_FRAME);
    const computeImageQuality = vi.fn().mockReturnValue({ ok: false, reasons: ["blurry"] });
    const { onAccepted } = renderStep({
      mediaDevices: { getUserMedia },
      captureFrame,
      computeImageQuality,
    });

    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    fireEvent.loadedData(await screen.findByTestId("camera-video-photo"));
    await user.click(await screen.findByRole("button", { name: "Capture" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("too blurry");
    expect(onAccepted).not.toHaveBeenCalled();
    // The camera UI re-appears so the passenger can try again.
    expect(await screen.findByTestId("camera-capture-photo")).toBeInTheDocument();
  });

  it("accepts a file selected through the fallback without running a quality check", async () => {
    const user = userEvent.setup();
    const { onAccepted } = renderStep({ mediaDevices: {} });
    const file = new File(["bytes"], "id.jpg", { type: "image/jpeg" });

    const input = (await screen.findByTestId(
      "precheckin-file-fallback-photo",
    )) as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(() => expect(onAccepted).toHaveBeenCalledWith({ role: "photo", blob: file }));
  });
});
