import { describe, expect, it } from "vitest";
import { createContentStub } from "./stub.js";
import { ContentMediaNotFoundError, DestinationSectionNotFoundError } from "../../modules/content/ports.js";

describe("createContentStub", () => {
  it("returns FAQ content in the requested locale with fallbackLocale: false", async () => {
    const stub = createContentStub();

    const result = await stub.getFaq("es");

    expect(result.locale).toBe("es");
    expect(result.fallbackLocale).toBe(false);
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data[0]).toMatchObject({ id: expect.any(String), question: expect.any(String) });
    expect(result.etag).toEqual(expect.any(String));
  });

  it("acceptance: falls back to the es locale (not empty content) when Portuguese has no FAQ translation", async () => {
    const stub = createContentStub();

    const result = await stub.getFaq("pt");

    expect(result.fallbackLocale).toBe(true);
    expect(result.locale).toBe("es");
    expect(result.data.length).toBeGreaterThan(0);
  });

  it("returns menu content for a configured tier+locale with no fallback flags set", async () => {
    const stub = createContentStub();

    const result = await stub.getMenu("PRIME", "es");

    expect(result.fallbackTier).toBe(false);
    expect(result.fallbackLocale).toBe(false);
    expect(result.data.length).toBeGreaterThan(0);
  });

  it("falls back to the default tier's menu when the requested tier has no CMS configuration", async () => {
    const stub = createContentStub();

    const result = await stub.getMenu("FIRST_CLASS", "es");

    expect(result.fallbackTier).toBe(true);
    expect(result.data.length).toBeGreaterThan(0);
  });

  it("falls back to es locale within the resolved tier when Portuguese has no menu translation", async () => {
    const stub = createContentStub();

    const result = await stub.getMenu("VOYAGER", "pt");

    expect(result.fallbackTier).toBe(false);
    expect(result.fallbackLocale).toBe(true);
    expect(result.locale).toBe("es");
    expect(result.data.length).toBeGreaterThan(0);
  });

  it("returns destination content per section, falling back to es when Portuguese is missing", async () => {
    const stub = createContentStub();

    const es = await stub.getDestination("how_to_get_there", "es");
    expect(es.fallbackLocale).toBe(false);

    const pt = await stub.getDestination("how_to_get_there", "pt");
    expect(pt.fallbackLocale).toBe(true);
    expect(pt.locale).toBe("es");
    expect(pt.data.body.length).toBeGreaterThan(0);
  });

  it("renders no live/real-time position data — the poi_map section is a static media reference, not a coordinate feed", async () => {
    const stub = createContentStub();

    const result = await stub.getDestination("poi_map", "es");

    // The body is a static media id string, never a lat/lng payload or live tracking reference.
    expect(result.data.body).toBe("MEDIA-POI-MAP");
    expect(result.data.body).not.toMatch(/-?\d{1,3}\.\d+,\s*-?\d{1,3}\.\d+/);
  });

  it("rejects an unknown destination section", async () => {
    const stub = createContentStub();

    await expect(stub.getDestination("not_a_real_section" as never, "es")).rejects.toThrow(
      DestinationSectionNotFoundError,
    );
  });

  it("serves the seeded static media asset for the POI map", async () => {
    const stub = createContentStub();

    const media = await stub.getMedia("MEDIA-POI-MAP");

    expect(media.contentType).toBe("image/svg+xml");
    const chunks: Buffer[] = [];
    for await (const chunk of media.body) {
      chunks.push(chunk as Buffer);
    }
    expect(Buffer.concat(chunks).toString("utf-8")).toContain("Static POI map stub");
  });

  it("throws ContentMediaNotFoundError for an unknown media id", async () => {
    const stub = createContentStub();

    await expect(stub.getMedia("unknown-media-id")).rejects.toThrow(ContentMediaNotFoundError);
  });

  it("simulateFailureOnce makes the next call reject once, then succeed normally", async () => {
    const stub = createContentStub();
    stub.simulateFailureOnce();

    await expect(stub.getFaq("es")).rejects.toThrow(/simulated/);

    const result = await stub.getFaq("es");
    expect(result.data.length).toBeGreaterThan(0);
  });
});
