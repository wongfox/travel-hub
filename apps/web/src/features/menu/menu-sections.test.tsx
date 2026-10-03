import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { MenuSection } from "contracts";
import { MenuSections } from "./menu-sections.js";

function buildSection(overrides: Partial<MenuSection> = {}): MenuSection {
  return {
    id: "sec-1",
    title: "Snacks",
    items: [{ id: "item-1", name: "Cookie", description: "Oat cookie" }],
    ...overrides,
  };
}

describe("MenuSections", () => {
  it("renders every section's title and each item's name/description", () => {
    render(
      <MenuSections
        sections={[
          buildSection({ id: "s1", title: "Snacks" }),
          buildSection({ id: "s2", title: "Drinks", items: [{ id: "i2", name: "Juice" }] }),
        ]}
      />,
    );

    expect(screen.getByText("Snacks")).toBeInTheDocument();
    expect(screen.getByText("Cookie")).toBeInTheDocument();
    expect(screen.getByText("Oat cookie")).toBeInTheDocument();
    expect(screen.getByText("Drinks")).toBeInTheDocument();
    expect(screen.getByText("Juice")).toBeInTheDocument();
  });

  it("acceptance: no menu item renders an add-to-cart, order, quantity, or purchase control", () => {
    render(<MenuSections sections={[buildSection({})]} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(screen.queryByText(/\$|S\/\.|USD|PEN/)).not.toBeInTheDocument();
  });
});
