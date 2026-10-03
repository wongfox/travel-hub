import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TfeLink } from "./tfe-link.js";

describe("TfeLink", () => {
  it("links to the BFF's allowlisted redirect endpoint with the given placement", () => {
    render(<TfeLink placement="home_banner">Discover more</TfeLink>);

    const link = screen.getByRole("link", { name: "Discover more" });
    expect(link).toHaveAttribute("href", "/api/out/tfe?placement=home_banner");
  });

  it("URL-encodes the placement value, never embedding a raw caller-controlled URL", () => {
    render(<TfeLink placement="a value/with?chars">Go</TfeLink>);

    const link = screen.getByRole("link", { name: "Go" });
    expect(link).toHaveAttribute("href", `/api/out/tfe?placement=${encodeURIComponent("a value/with?chars")}`);
  });
});
