import { describe, expect, it } from "vitest";
import { ServiceTierSchema } from "./service-tier.js";

describe("ServiceTierSchema", () => {
  it("accepts every resolvable service tier from design-interfaces", () => {
    expect(ServiceTierSchema.parse("VOYAGER")).toBe("VOYAGER");
    expect(ServiceTierSchema.parse("VISTADOME_360")).toBe("VISTADOME_360");
    expect(ServiceTierSchema.parse("PRIME")).toBe("PRIME");
    expect(ServiceTierSchema.parse("FIRST_CLASS")).toBe("FIRST_CLASS");
  });

  it("accepts UNKNOWN as the neutral-fallback tier", () => {
    expect(ServiceTierSchema.parse("UNKNOWN")).toBe("UNKNOWN");
  });

  it("rejects a tier value that is not part of the resolved set", () => {
    expect(() => ServiceTierSchema.parse("GOLD")).toThrow();
  });
});
