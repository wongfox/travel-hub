import { describe, expect, it } from "vitest";
import { resolveTfeRedirectUrl, type TfeRedirectConfig } from "./resolve-tfe-redirect.js";

const CONFIG: TfeRedirectConfig = {
  baseUrl: "https://www.trainexperience.example",
  allowedPlacements: {
    home_banner: "/offers/machu-picchu-sunset",
    menu_upsell: "/offers/private-tour",
  },
  attributionParams: { utm_source: "travel-hub-app", utm_medium: "in-app" },
};

describe("resolveTfeRedirectUrl", () => {
  it("resolves an allowlisted placement to its configured TFE URL with attribution params attached", () => {
    const url = resolveTfeRedirectUrl("home_banner", CONFIG);

    expect(url).not.toBeNull();
    const parsed = new URL(url!);
    expect(parsed.origin).toBe("https://www.trainexperience.example");
    expect(parsed.pathname).toBe("/offers/machu-picchu-sunset");
    expect(parsed.searchParams.get("utm_source")).toBe("travel-hub-app");
    expect(parsed.searchParams.get("utm_medium")).toBe("in-app");
    expect(parsed.searchParams.get("placement")).toBe("home_banner");
  });

  it("resolves a second allowlisted placement to its own distinct URL (open-redirect-safe: never a caller-supplied URL)", () => {
    const url = resolveTfeRedirectUrl("menu_upsell", CONFIG);

    expect(new URL(url!).pathname).toBe("/offers/private-tour");
  });

  it("returns null for a placement not on the allowlist (task 10.5's open-redirect-safety acceptance criterion)", () => {
    expect(resolveTfeRedirectUrl("arbitrary-attacker-value", CONFIG)).toBeNull();
    expect(resolveTfeRedirectUrl("https://evil.example", CONFIG)).toBeNull();
    expect(resolveTfeRedirectUrl("", CONFIG)).toBeNull();
  });
});
