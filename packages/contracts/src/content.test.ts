import { describe, expect, it } from "vitest";
import {
  ContentResultSchema,
  FaqEntrySchema,
  MenuItemSchema,
  MenuSectionSchema,
  RichContentSchema,
} from "./content.js";

describe("FaqEntrySchema", () => {
  it("round-trips a FAQ entry", () => {
    const entry = { id: "faq_01", question: "Where do I board?", answer: "At the station." };
    expect(FaqEntrySchema.parse(entry)).toEqual(entry);
  });
});

describe("MenuItemSchema", () => {
  it("accepts a purely descriptive menu item with no purchase-related field", () => {
    const item = { id: "item_01", name: "Coca tea", description: "Warm coca leaf infusion." };
    expect(MenuItemSchema.parse(item)).toEqual(item);
  });

  it("rejects a menu item carrying an add-to-cart action (onboard-menu 'no purchase action' rule)", () => {
    expect(() =>
      MenuItemSchema.parse({ id: "item_02", name: "Snack", addToCart: true }),
    ).toThrow();
  });

  it("rejects a menu item carrying a price or order quantity field", () => {
    expect(() =>
      MenuItemSchema.parse({ id: "item_03", name: "Snack", price: 500 }),
    ).toThrow();

    expect(() =>
      MenuItemSchema.parse({ id: "item_04", name: "Snack", quantity: 1 }),
    ).toThrow();
  });
});

describe("MenuSectionSchema", () => {
  it("round-trips a tier-scoped menu section with multiple items", () => {
    const section = {
      id: "sec_01",
      title: "Beverages",
      items: [
        { id: "item_01", name: "Coca tea" },
        { id: "item_02", name: "Pisco sour", description: "Non-alcoholic version available." },
      ],
    };

    expect(MenuSectionSchema.parse(section)).toEqual(section);
  });
});

describe("RichContentSchema", () => {
  it("round-trips a destination guide's title and body", () => {
    const content = { title: "How to get there", body: "Walk north from the station..." };
    expect(RichContentSchema.parse(content)).toEqual(content);
  });
});

describe("ContentResultSchema", () => {
  it("wraps FAQ data and reports a locale fallback", () => {
    const schema = ContentResultSchema(FaqEntrySchema.array());
    const result = {
      data: [{ id: "faq_01", question: "Q", answer: "A" }],
      locale: "es",
      fallbackLocale: true,
      fallbackTier: false,
      etag: "etag_01",
    };

    expect(schema.parse(result)).toEqual(result);
  });

  it("wraps a single RichContent item with no fallback applied", () => {
    const schema = ContentResultSchema(RichContentSchema);
    const result = {
      data: { title: "Circuits", body: "Circuit 1 covers..." },
      locale: "en",
      fallbackLocale: false,
      fallbackTier: false,
      etag: "etag_02",
    };

    const parsed = schema.parse(result);
    expect(parsed.fallbackLocale).toBe(false);
    expect(parsed.data.title).toBe("Circuits");
  });
});
