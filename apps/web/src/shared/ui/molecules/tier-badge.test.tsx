import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../../i18n/index.js";
import { TierBadge } from "./tier-badge.js";

describe("TierBadge", () => {
  it("renders the localized label for a resolved tier", () => {
    render(
      <I18nextProvider i18n={createI18n({ initialLocale: "en" })}>
        <TierBadge tier="FIRST_CLASS" />
      </I18nextProvider>,
    );

    expect(screen.getByText("First Class")).toBeInTheDocument();
  });

  it("renders the neutral label and tone for the UNKNOWN tier", () => {
    render(
      <I18nextProvider i18n={createI18n({ initialLocale: "en" })}>
        <TierBadge tier="UNKNOWN" />
      </I18nextProvider>,
    );

    expect(screen.getByText("Standard")).toBeInTheDocument();
    expect(screen.getByTestId("badge")).toHaveAttribute("data-tone", "neutral");
  });

  it("uses the accent tone for a resolved (non-UNKNOWN) tier", () => {
    render(
      <I18nextProvider i18n={createI18n({ initialLocale: "en" })}>
        <TierBadge tier="PRIME" />
      </I18nextProvider>,
    );

    expect(screen.getByTestId("badge")).toHaveAttribute("data-tone", "accent");
  });

  it("renders in Portuguese when the active locale is pt", () => {
    render(
      <I18nextProvider i18n={createI18n({ initialLocale: "pt" })}>
        <TierBadge tier="PRIME" />
      </I18nextProvider>,
    );

    expect(screen.getByText("Prime")).toBeInTheDocument();
  });
});
