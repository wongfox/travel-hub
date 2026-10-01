import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../i18n/index.js";
import { PulsePrompt } from "./pulse-prompt.js";

function renderWithI18n(ui: React.ReactElement) {
  const i18n = createI18n({ initialLocale: "en" });
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

describe("PulsePrompt", () => {
  it("renders one button per face on the 1-5 scale", () => {
    renderWithI18n(<PulsePrompt onSubmit={vi.fn()} isSubmitting={false} />);

    expect(screen.getAllByRole("button")).toHaveLength(5);
  });

  it("calls onSubmit with the selected score", async () => {
    const onSubmit = vi.fn();
    renderWithI18n(<PulsePrompt onSubmit={onSubmit} isSubmitting={false} />);

    await userEvent.click(screen.getByTestId("pulse-face-2"));

    expect(onSubmit).toHaveBeenCalledWith(2);
  });

  it("disables every face button while a submission is in flight", () => {
    renderWithI18n(<PulsePrompt onSubmit={vi.fn()} isSubmitting={true} />);

    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
  });
});
