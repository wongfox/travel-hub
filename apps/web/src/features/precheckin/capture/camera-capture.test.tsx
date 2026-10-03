import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../../i18n/index.js";
import { CameraCapture, type MediaDevicesLike } from "./camera-capture.js";
import type { CapturedFrame } from "./capture-frame.js";

afterEach(() => {
  cleanup();
});

function buildStream(stopTrack = vi.fn()) {
  return { getTracks: () => [{ stop: stopTrack }] };
}

function renderCameraCapture(props: {
  role: "photo" | "id_front" | "id_back";
  mediaDevices: MediaDevicesLike;
  onCaptured?: (frame: CapturedFrame) => void;
  onUnavailable?: () => void;
  captureFrame?: () => Promise<CapturedFrame>;
}) {
  const onCaptured = props.onCaptured ?? vi.fn();
  const onUnavailable = props.onUnavailable ?? vi.fn();
  render(
    <I18nextProvider i18n={createI18n({ initialLocale: "en" })}>
      <CameraCapture
        role={props.role}
        mediaDevices={props.mediaDevices}
        onCaptured={onCaptured}
        onUnavailable={onUnavailable}
        {...(props.captureFrame ? { captureFrame: props.captureFrame } : {})}
        createCanvas={() => ({}) as never}
      />
    </I18nextProvider>,
  );
  return { onCaptured, onUnavailable };
}

describe("CameraCapture", () => {
  it("requests the front (user-facing) camera for the photo role", async () => {
    const getUserMedia = vi.fn().mockResolvedValue(buildStream());
    renderCameraCapture({ role: "photo", mediaDevices: { getUserMedia } });

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: "user" } }));
  });

  it("requests the rear (environment-facing) camera for an ID role", async () => {
    const getUserMedia = vi.fn().mockResolvedValue(buildStream());
    renderCameraCapture({ role: "id_front", mediaDevices: { getUserMedia } });

    await waitFor(() =>
      expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: "environment" } }),
    );
  });

  it("shows the capture button only once the camera stream is ready", async () => {
    const getUserMedia = vi.fn().mockResolvedValue(buildStream());
    renderCameraCapture({ role: "photo", mediaDevices: { getUserMedia } });

    expect(screen.queryByRole("button", { name: "Capture" })).not.toBeInTheDocument();
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    // Stream acquired but no frame decoded yet (videoWidth is still 0): capturing now would
    // draw a 0x0 canvas, so the button must wait for the video's first frame.
    expect(screen.queryByRole("button", { name: "Capture" })).not.toBeInTheDocument();

    fireEvent.loadedData(screen.getByTestId("camera-video-photo"));

    expect(await screen.findByRole("button", { name: "Capture" })).toBeInTheDocument();
  });

  it("calls onUnavailable instead of rendering a capture button when getUserMedia rejects", async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new Error("permission denied"));
    const { onUnavailable } = renderCameraCapture({ role: "photo", mediaDevices: { getUserMedia } });

    await waitFor(() => expect(onUnavailable).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: "Capture" })).not.toBeInTheDocument();
  });

  it("calls onUnavailable immediately when no camera API exists at all", async () => {
    const { onUnavailable } = renderCameraCapture({
      role: "photo",
      mediaDevices: {} as MediaDevicesLike,
    });

    await waitFor(() => expect(onUnavailable).toHaveBeenCalledTimes(1));
  });

  it("captures a frame and reports it via onCaptured when the capture button is clicked", async () => {
    const user = userEvent.setup();
    const getUserMedia = vi.fn().mockResolvedValue(buildStream());
    const fakeFrame: CapturedFrame = {
      blob: new Blob(["jpeg"], { type: "image/jpeg" }),
      imageData: { width: 10, height: 10, data: new Uint8ClampedArray(4) },
    };
    const captureFrame = vi.fn().mockResolvedValue(fakeFrame);
    const { onCaptured } = renderCameraCapture({
      role: "photo",
      mediaDevices: { getUserMedia },
      captureFrame,
    });

    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    fireEvent.loadedData(screen.getByTestId("camera-video-photo"));
    await screen.findByRole("button", { name: "Capture" });
    await user.click(screen.getByRole("button", { name: "Capture" }));

    await waitFor(() => expect(onCaptured).toHaveBeenCalledWith(fakeFrame));
    expect(captureFrame).toHaveBeenCalledTimes(1);
  });

  it("stops every media track on unmount", async () => {
    const stopTrack = vi.fn();
    const getUserMedia = vi.fn().mockResolvedValue(buildStream(stopTrack));
    render(
      <I18nextProvider i18n={createI18n({ initialLocale: "en" })}>
        <CameraCapture
          role="photo"
          mediaDevices={{ getUserMedia }}
          onCaptured={vi.fn()}
          onUnavailable={vi.fn()}
          createCanvas={() => ({}) as never}
        />
      </I18nextProvider>,
    );
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());

    cleanup();

    await waitFor(() => expect(stopTrack).toHaveBeenCalledTimes(1));
  });
});
