import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppShell } from "./app-shell.js";

describe("AppShell", () => {
  it("renders the Travel Hub landmark heading with no crash", () => {
    render(<AppShell />);

    expect(screen.getByRole("heading", { name: "Travel Hub" })).toBeInTheDocument();
  });

  it("renders provided children below the heading", () => {
    render(
      <AppShell>
        <p>Route content</p>
      </AppShell>,
    );

    expect(screen.getByText("Route content")).toBeInTheDocument();
  });
});
