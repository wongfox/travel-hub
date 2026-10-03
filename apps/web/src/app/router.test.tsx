import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryHistory } from "@tanstack/react-router";
import { createAppRouter } from "./router.js";
import { AppProviders } from "./providers.js";
import { createI18n } from "../i18n/index.js";

describe("app router", () => {
  it("renders a localized not-found boundary for an undefined route instead of crashing", async () => {
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/this-route-does-not-exist"] }),
    });

    render(<AppProviders router={router} i18n={createI18n({ initialLocale: "en" })} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Page not found");
  });

  it("renders the not-found boundary in the active locale", async () => {
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/this-route-does-not-exist"] }),
    });

    render(<AppProviders router={router} i18n={createI18n({ initialLocale: "pt" })} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Página não encontrada");
  });

  it("renders the index route at the root path", async () => {
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });

    render(<AppProviders router={router} i18n={createI18n({ initialLocale: "en" })} />);

    expect(await screen.findByRole("heading", { name: "Travel Hub" })).toBeInTheDocument();
  });
});
