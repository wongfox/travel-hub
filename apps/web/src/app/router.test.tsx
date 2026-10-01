import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryHistory } from "@tanstack/react-router";
import type { TripDTO } from "contracts";
import { createAppRouter } from "./router.js";
import { AppProviders } from "./providers.js";
import { createI18n } from "../i18n/index.js";

function buildTripFixture(overrides: Partial<TripDTO> = {}): TripDTO {
  return {
    linkId: "link-1",
    reservationRefMasked: "RES***01",
    expiresAt: "2026-12-01T00:00:00.000Z",
    passengers: [],
    legs: [
      {
        id: "leg-1",
        origin: "Poroy",
        destination: "Machu Picchu",
        departureLocal: "2026-11-10T08:00:00",
        arrivalLocal: "2026-11-10T11:30:00",
        tier: "PRIME",
        status: "SCHEDULED",
      },
    ],
    boardingPasses: [],
    documents: [],
    alerts: [],
    nextMilestone: { legId: "leg-1", kind: "departure", atLocal: "2026-11-10T08:00:00" },
    features: {} as TripDTO["features"],
    fetchedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Routes fetch mock calls by URL, since a full `/t` → `/trip` flow now issues both a session-exchange POST and a trip-overview GET. */
function stubFetchByUrl(responses: Record<string, unknown>) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url in responses) {
      return Promise.resolve(new Response(JSON.stringify(responses[url]), { status: 200 }));
    }
    return Promise.reject(new Error(`unexpected fetch to ${url}`));
  });
}

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

  it("exchanges the fragment token and lands on the real trip home in one step", async () => {
    window.location.hash = "#a-real-token";
    const fetchMock = stubFetchByUrl({
      "/api/session": { expiresAt: "2026-11-05T00:00:00.000Z" },
      "/api/trip": buildTripFixture(),
    });
    vi.stubGlobal("fetch", fetchMock);
    const router = createAppRouter({ history: createMemoryHistory({ initialEntries: ["/t"] }) });

    render(<AppProviders router={router} i18n={createI18n({ initialLocale: "en" })} />);

    expect(await screen.findByTestId("trip-status")).toHaveTextContent("Upcoming trip");
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

describe("trip-home, trip-itinerary, and travel-documents routes (task 6.5)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the tier-themed trip home directly at /trip", async () => {
    vi.stubGlobal("fetch", stubFetchByUrl({ "/api/trip": buildTripFixture() }));
    const router = createAppRouter({ history: createMemoryHistory({ initialEntries: ["/trip"] }) });

    render(<AppProviders router={router} i18n={createI18n({ initialLocale: "en" })} />);

    expect(await screen.findByTestId("trip-status")).toHaveTextContent("Upcoming trip");
  });

  it("renders the itinerary timeline at /trip/itinerary", async () => {
    vi.stubGlobal("fetch", stubFetchByUrl({ "/api/trip": buildTripFixture() }));
    const router = createAppRouter({ history: createMemoryHistory({ initialEntries: ["/trip/itinerary"] }) });

    render(<AppProviders router={router} i18n={createI18n({ initialLocale: "en" })} />);

    expect(await screen.findByTestId("itinerary-milestone")).toBeInTheDocument();
  });

  it("renders the travel documents at /trip/documents", async () => {
    const trip = buildTripFixture({
      documents: [
        { id: "ticket-1", kind: "TRAIN", title: "Train Poroy → Machu Picchu", milestoneId: "leg-1", barcodePayload: "BP-1" },
      ],
    });
    vi.stubGlobal("fetch", stubFetchByUrl({ "/api/trip": trip }));
    const router = createAppRouter({ history: createMemoryHistory({ initialEntries: ["/trip/documents"] }) });

    render(<AppProviders router={router} i18n={createI18n({ initialLocale: "en" })} />);

    expect(await screen.findByTestId("ticket-item")).toBeInTheDocument();
  });
});

describe("help, menu, and destination routes (tasks 9.2-9.4)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the FAQ content at /trip/help", async () => {
    vi.stubGlobal(
      "fetch",
      stubFetchByUrl({
        "/api/trip": buildTripFixture(),
        "/api/content/faq": {
          data: [{ id: "f1", question: "How do I board?", answer: "Arrive early." }],
          locale: "en",
          fallbackLocale: false,
          fallbackTier: false,
          etag: "x",
        },
      }),
    );
    const router = createAppRouter({ history: createMemoryHistory({ initialEntries: ["/trip/help"] }) });

    render(<AppProviders router={router} i18n={createI18n({ initialLocale: "en" })} />);

    expect(await screen.findByText("How do I board?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /whatsapp/i })).toBeInTheDocument();
  });

  it("renders the onboard menu at /trip/menu with no purchase control", async () => {
    vi.stubGlobal(
      "fetch",
      stubFetchByUrl({
        "/api/trip": buildTripFixture(),
        "/api/content/menu": {
          data: [{ id: "s1", title: "Snacks", items: [{ id: "i1", name: "Cookie" }] }],
          locale: "en",
          fallbackLocale: false,
          fallbackTier: false,
          etag: "x",
        },
      }),
    );
    const router = createAppRouter({ history: createMemoryHistory({ initialEntries: ["/trip/menu"] }) });

    render(<AppProviders router={router} i18n={createI18n({ initialLocale: "en" })} />);

    expect(await screen.findByText("Cookie")).toBeInTheDocument();
    // The only buttons on the page are the shell-wide language switcher
    // (AppShell, task 7.3) — never a purchase/order control on a menu item.
    for (const button of screen.getAllByRole("button")) {
      expect(button).not.toHaveTextContent(/add|order|buy|cart/i);
    }
  });

  it("renders the destination content at /trip/destination", async () => {
    vi.stubGlobal(
      "fetch",
      stubFetchByUrl({
        "/api/trip": buildTripFixture(),
        "/api/content/destination/poi_map": {
          data: { title: "POI map", body: "MEDIA-POI-MAP" },
          locale: "en",
          fallbackLocale: false,
          fallbackTier: false,
          etag: "x",
        },
        "/api/content/destination/how_to_get_there": {
          data: { title: "How to get there", body: "Walk to the bus stop." },
          locale: "en",
          fallbackLocale: false,
          fallbackTier: false,
          etag: "x",
        },
        "/api/content/destination/circuits": {
          data: { title: "Circuits", body: "Check your entry ticket." },
          locale: "en",
          fallbackLocale: false,
          fallbackTier: false,
          etag: "x",
        },
      }),
    );
    const router = createAppRouter({ history: createMemoryHistory({ initialEntries: ["/trip/destination"] }) });

    render(<AppProviders router={router} i18n={createI18n({ initialLocale: "en" })} />);

    expect(await screen.findByRole("img", { name: "POI map" })).toBeInTheDocument();
    expect(screen.getByText("Walk to the bus stop.")).toBeInTheDocument();
  });
});

/**
 * task 7.3's own acceptance criterion, verbatim: "switching to Portuguese
 * renders every Phase 4–6 screen fully in Portuguese" — driven through the
 * real `LanguageSwitcher` (rendered by `AppShell` on every route), not by
 * constructing a Portuguese `i18n` instance directly.
 */
describe("switching language via the shell-wide LanguageSwitcher (task 7.3)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("re-renders trip home fully in Portuguese after selecting it from any screen", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", stubFetchByUrl({ "/api/trip": buildTripFixture() }));
    const router = createAppRouter({ history: createMemoryHistory({ initialEntries: ["/trip"] }) });

    render(<AppProviders router={router} i18n={createI18n({ initialLocale: "en" })} />);

    expect(await screen.findByTestId("trip-status")).toHaveTextContent("Upcoming trip");

    await user.click(screen.getByRole("button", { name: "Portuguese" }));

    expect(await screen.findByTestId("trip-status")).toHaveTextContent("Viagem próxima");
    expect(screen.getByRole("link", { name: "Itinerário" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Documentos" })).toBeInTheDocument();
  });

  it("re-renders the not-found boundary in Portuguese after selecting it", async () => {
    const user = userEvent.setup();
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/this-route-does-not-exist"] }),
    });

    render(<AppProviders router={router} i18n={createI18n({ initialLocale: "en" })} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Page not found");

    await user.click(screen.getByRole("button", { name: "Portuguese" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Página não encontrada");
  });
});
