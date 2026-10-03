import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../i18n/index.js";
import { WhatsAppButton } from "./whatsapp-button.js";
import { WHATSAPP_SUPPORT_NUMBER } from "./whatsapp-config.js";

function renderButton() {
  return render(
    <I18nextProvider i18n={createI18n({ initialLocale: "en" })}>
      <WhatsAppButton />
    </I18nextProvider>,
  );
}

describe("WhatsAppButton", () => {
  it("renders a link targeting the configured WhatsApp support number", () => {
    renderButton();

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", `https://wa.me/${WHATSAPP_SUPPORT_NUMBER}`);
  });

  it("opens in a new tab, since it leaves the app", () => {
    renderButton();

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
  });
});
