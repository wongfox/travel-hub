import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import type { FaqEntry } from "contracts";
import { createI18n } from "../../i18n/index.js";
import { FaqList } from "./faq-list.js";

function buildEntry(overrides: Partial<FaqEntry>): FaqEntry {
  return { id: "faq-1", question: "How do I board?", answer: "Arrive early.", ...overrides };
}

function renderList(entries: FaqEntry[]) {
  return render(
    <I18nextProvider i18n={createI18n({ initialLocale: "en" })}>
      <FaqList entries={entries} />
    </I18nextProvider>,
  );
}

describe("FaqList", () => {
  it("renders every FAQ entry's question and answer", () => {
    renderList([
      buildEntry({ id: "f1", question: "Q1", answer: "A1" }),
      buildEntry({ id: "f2", question: "Q2", answer: "A2" }),
    ]);

    expect(screen.getByText("Q1")).toBeInTheDocument();
    expect(screen.getByText("A1")).toBeInTheDocument();
    expect(screen.getByText("Q2")).toBeInTheDocument();
    expect(screen.getByText("A2")).toBeInTheDocument();
  });

  it("renders no interactive chat/ticket-submission control (acceptance: FAQ is content-only)", () => {
    renderList([buildEntry({})]);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
