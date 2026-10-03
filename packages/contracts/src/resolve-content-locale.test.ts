import { describe, expect, it } from "vitest";
import {
  MissingDefaultLocaleContentError,
  resolveLocalizedContent,
} from "./resolve-content-locale.js";

describe("resolveLocalizedContent", () => {
  it("returns the requested locale's content with no fallback flag when present", () => {
    const result = resolveLocalizedContent({
      byLocale: { es: "Hola", en: "Hello", pt: "Olá" },
      requestedLocale: "pt",
      defaultLocale: "es",
    });

    expect(result).toEqual({ data: "Olá", locale: "pt", fallbackLocale: false });
  });

  it("falls back to the default locale's content when the requested locale is missing", () => {
    const result = resolveLocalizedContent({
      byLocale: { es: "Hola", en: "Hello" },
      requestedLocale: "pt",
      defaultLocale: "es",
    });

    expect(result).toEqual({ data: "Hola", locale: "es", fallbackLocale: true });
  });

  it("does not flag a fallback when the requested locale IS the default locale", () => {
    const result = resolveLocalizedContent({
      byLocale: { es: "Hola" },
      requestedLocale: "es",
      defaultLocale: "es",
    });

    expect(result).toEqual({ data: "Hola", locale: "es", fallbackLocale: false });
  });

  it("throws MissingDefaultLocaleContentError when neither the requested nor the default locale has content", () => {
    expect(() =>
      resolveLocalizedContent({
        byLocale: { en: "Hello" },
        requestedLocale: "pt",
        defaultLocale: "es",
      }),
    ).toThrow(MissingDefaultLocaleContentError);
  });

  it("names the missing default locale in the thrown error's message", () => {
    expect.assertions(1);
    try {
      resolveLocalizedContent({ byLocale: {}, requestedLocale: "pt", defaultLocale: "es" });
    } catch (error) {
      expect((error as Error).message).toContain("es");
    }
  });
});
