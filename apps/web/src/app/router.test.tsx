import { afterEach, describe, expect, it, vi } from "vitest";
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

describe("trip-access landing route (task 5.5)", () => {
  const originalHash = window.location.hash;

  afterEach(() => {
    window.location.hash = originalHash;
    vi.unstubAllGlobals();
  });

  it("exchanges the fragment token and lands on the trip-home stub in one step", async () => {
    window.location.hash = "#a-real-token";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ expiresAt: "2026-11-05T00:00:00.000Z" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const router = createAppRouter({ history: createMemoryHistory({ initialEntries: ["/t"] }) });

    render(<AppProviders router={router} i18n={createI18n({ initialLocale: "en" })} />);

    expect(await screen.findByTestId("trip-home-stub")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/session",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows the re-request path when the fragment has no token", async () => {
    window.location.hash = "";
    const router = createAppRouter({ history: createMemoryHistory({ initialEntries: ["/t"] }) });

    render(<AppProviders router={router} i18n={createI18n({ initialLocale: "en" })} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("This link is no longer valid.");
  });
});
