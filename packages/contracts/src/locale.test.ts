import { describe, expect, it } from "vitest";
import { LocaleSchema } from "./locale.js";

describe("LocaleSchema", () => {
  it("accepts every supported locale code", () => {
    expect(LocaleSchema.parse("es")).toBe("es");
    expect(LocaleSchema.parse("en")).toBe("en");
    expect(LocaleSchema.parse("pt")).toBe("pt");
  });

  it("rejects an unsupported locale code", () => {
    expect(() => LocaleSchema.parse("fr")).toThrow();
  });
});
