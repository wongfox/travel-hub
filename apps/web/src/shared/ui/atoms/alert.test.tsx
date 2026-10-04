import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Alert } from "./alert.js";

describe("Alert", () => {
  it("announces warnings and errors assertively with role=alert by default", () => {
    render(
      <>
        <Alert tone="warning">Careful</Alert>
        <Alert tone="error">Broken</Alert>
      </>,
    );

    expect(screen.getAllByRole("alert")).toHaveLength(2);
  });

  it("announces info and success politely with role=status by default", () => {
    render(
      <>
        <Alert tone="info">FYI</Alert>
        <Alert tone="success">Done</Alert>
      </>,
    );

    expect(screen.getAllByRole("status")).toHaveLength(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("lets the caller override the live-region role", () => {
    render(
      <Alert tone="info" role="alert">
        Override
      </Alert>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Override");
  });

  it("applies the tone class and renders children", () => {
    render(<Alert tone="warning">Careful</Alert>);

    expect(screen.getByRole("alert")).toHaveClass("alert", "alert--warning");
    expect(screen.getByText("Careful")).toBeInTheDocument();
  });
});
