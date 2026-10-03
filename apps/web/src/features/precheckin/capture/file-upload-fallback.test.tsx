import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../../i18n/index.js";
import { FileUploadFallback } from "./file-upload-fallback.js";

function renderFallback(role: "photo" | "id_front" | "id_back", onFileSelected = vi.fn()) {
  render(
    <I18nextProvider i18n={createI18n({ initialLocale: "en" })}>
      <FileUploadFallback role={role} onFileSelected={onFileSelected} />
    </I18nextProvider>,
  );
  return onFileSelected;
}

describe("FileUploadFallback", () => {
  it("renders a file input using the front (user-facing) camera hint for the photo role", () => {
    renderFallback("photo");

    const input = screen.getByTestId("precheckin-file-fallback-photo") as HTMLInputElement;
    expect(input.type).toBe("file");
    expect(input.accept).toBe("image/*");
    expect(input.getAttribute("capture")).toBe("user");
  });

  it("renders a file input using the rear (environment-facing) camera hint for the id_front role", () => {
    renderFallback("id_front");

    expect(screen.getByTestId("precheckin-file-fallback-id_front").getAttribute("capture")).toBe(
      "environment",
    );
  });

  it("calls onFileSelected with the chosen file", () => {
    const onFileSelected = renderFallback("photo");
    const file = new File(["bytes"], "photo.jpg", { type: "image/jpeg" });
    const input = screen.getByTestId("precheckin-file-fallback-photo") as HTMLInputElement;

    Object.defineProperty(input, "files", { value: [file] });
    input.dispatchEvent(new Event("change", { bubbles: true }));

    expect(onFileSelected).toHaveBeenCalledWith(file);
  });

  it("does not call onFileSelected when the change event carries no file", () => {
    const onFileSelected = renderFallback("photo");
    const input = screen.getByTestId("precheckin-file-fallback-photo") as HTMLInputElement;

    Object.defineProperty(input, "files", { value: [] });
    input.dispatchEvent(new Event("change", { bubbles: true }));

    expect(onFileSelected).not.toHaveBeenCalled();
  });
});
