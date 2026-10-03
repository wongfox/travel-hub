import { describe, expect, it } from "vitest";
import { buildWhatsAppDeepLink, WHATSAPP_SUPPORT_NUMBER } from "./whatsapp-config.js";

describe("buildWhatsAppDeepLink", () => {
  it("builds a wa.me link targeting the configured support number by default", () => {
    expect(buildWhatsAppDeepLink()).toBe(`https://wa.me/${WHATSAPP_SUPPORT_NUMBER}`);
  });

  it("builds a wa.me link targeting an explicitly provided number", () => {
    expect(buildWhatsAppDeepLink("51123456789")).toBe("https://wa.me/51123456789");
  });

  it("never includes prefill text by default (prefill is TBD/configurable per spec)", () => {
    expect(buildWhatsAppDeepLink()).not.toContain("?text=");
  });
});
