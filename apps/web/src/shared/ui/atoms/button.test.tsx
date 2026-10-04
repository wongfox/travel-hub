import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button, ButtonLink } from "./button.js";

describe("Button", () => {
  it("defaults to a primary, non-submitting button", () => {
    render(<Button>Pay</Button>);

    const button = screen.getByRole("button", { name: "Pay" });
    expect(button).toHaveClass("btn", "btn--primary");
    expect(button).toHaveAttribute("type", "button");
  });

  it.each(["secondary", "ghost"] as const)("applies the %s variant class", (variant) => {
    render(<Button variant={variant}>Go</Button>);

    expect(screen.getByRole("button", { name: "Go" })).toHaveClass(`btn--${variant}`);
  });

  it("stretches to full width when asked and keeps caller classes", () => {
    render(
      <Button block className="extra">
        Go
      </Button>,
    );

    expect(screen.getByRole("button", { name: "Go" })).toHaveClass("btn--block", "extra");
  });

  it("forwards native props such as onClick and disabled", async () => {
    const onClick = vi.fn();
    render(
      <>
        <Button onClick={onClick}>Active</Button>
        <Button disabled onClick={onClick}>
          Inactive
        </Button>
      </>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Active" }));
    await userEvent.click(screen.getByRole("button", { name: "Inactive" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("ButtonLink", () => {
  it("renders an anchor that looks like a button and keeps its href", () => {
    render(
      <ButtonLink href="/api/documents/DOC-1" variant="primary" target="_blank" rel="noreferrer">
        View
      </ButtonLink>,
    );

    const link = screen.getByRole("link", { name: "View" });
    expect(link).toHaveAttribute("href", "/api/documents/DOC-1");
    expect(link).toHaveClass("btn", "btn--primary");
  });
});
