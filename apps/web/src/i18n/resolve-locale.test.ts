import { describe, expect, it } from "vitest";
import { resolveLocale } from "./resolve-locale.js";

describe("resolveLocale", () => {
  it("prefers the explicit choice over every other source", () => {
    expect(
      resolveLocale({
        explicitChoice: "en",
        bookingLocaleHint: "pt",
        navigatorLanguages: ["fr-FR"],
      }),
    ).toBe("en");
  });

  it("falls back to the booking locale hint when there is no explicit choice", () => {
    expect(
      resolveLocale({
        explicitChoice: null,
        bookingLocaleHint: "pt",
        navigatorLanguages: ["fr-FR"],
      }),
    ).toBe("pt");
  });

  it("falls back to the first supported navigator language when explicit choice and hint are absent", () => {
    expect(
      resolveLocale({
        explicitChoice: null,
        bookingLocaleHint: null,
        navigatorLanguages: ["fr-FR", "de-DE", "en-US"],
      }),
    ).toBe("en");
  });

  it("falls back to the source locale (es) when nothing else resolves", () => {
    expect(
      resolveLocale({
        explicitChoice: null,
        bookingLocaleHint: null,
        navigatorLanguages: ["fr-FR"],
      }),
    ).toBe("es");
  });

  it("ignores an unsupported explicit choice and continues down the resolution order", () => {
    expect(
      resolveLocale({
        explicitChoice: "fr",
        bookingLocaleHint: "pt",
        navigatorLanguages: [],
      }),
    ).toBe("pt");
  });
});
