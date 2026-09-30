import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../../i18n/index.js";
import { ConsentScreen } from "./consent-screen.js";

function renderScreen(onAccept = vi.fn(), onDecline = vi.fn(), submitting = false) {
  render(
    <I18nextProvider i18n={createI18n({ initialLocale: "en" })}>
      <ConsentScreen onAccept={onAccept} onDecline={onDecline} submitting={submitting} />
    </I18nextProvider>,
  );
  return { onAccept, onDecline };
}

describe("ConsentScreen", () => {
  it("renders the consent title and body text", () => {
    renderScreen();

    expect(screen.getByText("Pre check-in: photo & ID consent")).toBeInTheDocument();
    expect(screen.getByText(/capture a photo of you/)).toBeInTheDocument();
  });

  it("calls onAccept when the accept button is clicked", async () => {
    const user = userEvent.setup();
    const { onAccept } = renderScreen();

    await user.click(screen.getByRole("button", { name: "I agree" }));

    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("calls onDecline when the decline button is clicked", async () => {
    const user = userEvent.setup();
    const { onDecline } = renderScreen();

    await user.click(screen.getByRole("button", { name: "Not now" }));

    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  it("disables both buttons while submitting", () => {
    renderScreen(vi.fn(), vi.fn(), true);

    expect(screen.getByRole("button", { name: "I agree" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Not now" })).toBeDisabled();
  });
});
