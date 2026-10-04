import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoadingState } from "./loading-state.js";

describe("LoadingState", () => {
  it("exposes the label as a status live region", () => {
    render(<LoadingState label="Loading your trip…" />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading your trip…");
  });

  it("hides the decorative spinner and skeleton placeholders from assistive tech", () => {
    const { container } = render(<LoadingState label="Loading" skeletons={2} />);

    expect(container.querySelectorAll(".skeleton--block")).toHaveLength(2);
    expect(container.querySelector(".spinner")).toHaveAttribute("aria-hidden", "true");
    for (const placeholder of container.querySelectorAll(".skeleton--block")) {
      expect(placeholder).toHaveAttribute("aria-hidden", "true");
    }
  });
});
