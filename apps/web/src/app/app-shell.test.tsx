import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppShell } from "./app-shell.js";

describe("AppShell", () => {
  it("renders the Travel Hub landmark heading with no crash", () => {
    render(<AppShell />);

    expect(screen.getByRole("heading", { name: "Travel Hub" })).toBeInTheDocument();
  });
});
