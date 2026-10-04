import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../../i18n/index.js";
import { LOCALE_STORAGE_KEY } from "../../../i18n/index.js";
import { LanguageSwitcher } from "./language-switcher.js";

/**
 * `localization` "Language selection" (spec: "MUST let the passenger select
 * or change their language, and MUST persist that selection for the
 * session/link" / "Selected language persists across screens"). Rendered
 * once in `AppShell` so it is present on every screen.
 */
describe("LanguageSwitcher", () => {
  afterEach(() => {
    window.localStorage.removeItem(LOCALE_STORAGE_KEY);
  });

  it("renders one button per supported locale, labeled in the active language", () => {
    render(
      <I18nextProvider i18n={createI18n({ initialLocale: "en" })}>
        <LanguageSwitcher />
      </I18nextProvider>,
    );

    expect(screen.getByRole("button", { name: "Spanish" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "English" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Portuguese" })).toBeInTheDocument();
  });

  it("shows compact locale codes visually while the accessible name stays the language name", () => {
    render(
      <I18nextProvider i18n={createI18n({ initialLocale: "en" })}>
        <LanguageSwitcher />
      </I18nextProvider>,
    );

    const button = screen.getByRole("button", { name: "Spanish" });
    expect(button).toHaveTextContent("ES");
    expect(button).toHaveClass("segmented__option");
  });

  it("marks the currently active locale's button as pressed", () => {
    render(
      <I18nextProvider i18n={createI18n({ initialLocale: "en" })}>
        <LanguageSwitcher />
      </I18nextProvider>,
    );

    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Spanish" })).toHaveAttribute("aria-pressed", "false");
  });

  it("switches the active language and re-renders its own labels in Portuguese", async () => {
    const user = userEvent.setup();
    const i18n = createI18n({ initialLocale: "en" });
    render(
      <I18nextProvider i18n={i18n}>
        <LanguageSwitcher />
      </I18nextProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Portuguese" }));

    expect(await screen.findByRole("button", { name: "Português" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("persists the selection so a later startup reads the same locale", async () => {
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={createI18n({ initialLocale: "en" })}>
        <LanguageSwitcher />
      </I18nextProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Spanish" }));

    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("es");
  });
});
