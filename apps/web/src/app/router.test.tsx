import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryHistory } from "@tanstack/react-router";
import { createAppRouter } from "./router.js";
import { AppProviders } from "./providers.js";

describe("app router", () => {
  it("renders a not-found boundary for an undefined route instead of crashing", async () => {
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/this-route-does-not-exist"] }),
    });

    render(<AppProviders router={router} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Route not found");
  });

  it("renders the index route at the root path", async () => {
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });

    render(<AppProviders router={router} />);

    expect(await screen.findByRole("heading", { name: "Travel Hub" })).toBeInTheDocument();
  });
});
