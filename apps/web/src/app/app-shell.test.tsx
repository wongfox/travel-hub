import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../i18n/index.js";
import { AppShell } from "./app-shell.js";

describe("AppShell", () => {
  it("renders the Travel Hub landmark heading with no crash", () => {
    render(
      <I18nextProvider i18n={createI18n({ initialLocale: "en" })}>
        <AppShell />
      </I18nextProvider>,
    );

    expect(screen.getByRole("heading", { name: "Travel Hub" })).toBeInTheDocument();
  });

  it("renders provided children below the heading", () => {
    render(
      <I18nextProvider i18n={createI18n({ initialLocale: "en" })}>
        <AppShell>
          <p>Route content</p>
        </AppShell>
      </I18nextProvider>,
    );

    expect(screen.getByText("Route content")).toBeInTheDocument();
  });

  /**
   * task 7.3, `localization` "Language selection": the switcher must be
   * present on every screen, so it lives in the shell every route renders
   * inside, not duplicated per feature.
   */
  it("renders the language switcher so it is present on every screen", () => {
    render(
      <I18nextProvider i18n={createI18n({ initialLocale: "en" })}>
        <AppShell />
      </I18nextProvider>,
    );

    expect(screen.getByRole("group", { name: "Language" })).toBeInTheDocument();
  });
});
