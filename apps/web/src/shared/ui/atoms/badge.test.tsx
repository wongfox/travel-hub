import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "./badge.js";

describe("Badge", () => {
  it("renders its children", () => {
    render(<Badge>Prime</Badge>);

    expect(screen.getByText("Prime")).toBeInTheDocument();
  });

  it("defaults to the neutral tone", () => {
    render(<Badge>Prime</Badge>);

    expect(screen.getByTestId("badge")).toHaveAttribute("data-tone", "neutral");
  });

  it("applies the accent tone when requested", () => {
    render(<Badge tone="accent">Prime</Badge>);

    expect(screen.getByTestId("badge")).toHaveAttribute("data-tone", "accent");
  });
});
