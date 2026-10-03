import type { ConformanceSpec } from "../_conformance-harness/conformance-harness.js";
import type { ContentPort } from "../../modules/content/ports.js";

async function drain(body: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks);
}

/**
 * Conformance suite for `ContentPort` (design Decision 6): runs against the
 * stub in CI, and against a real headless-CMS adapter once one is chosen
 * (design's Open Questions). Every case holds for the seeded fixtures in
 * `services/bff/seed/content/`, which any conforming adapter must also
 * resolve the same way — in particular the task 9.1 acceptance criterion:
 * a locale gap must fall back to real default-locale content, never empty
 * content.
 */
export const contentContract: ConformanceSpec<ContentPort> = {
  cases: [
    {
      name: "getFaq returns non-empty content for the default locale",
      async run(port) {
        const result = await port.getFaq("es");
        if (result.data.length === 0) {
          throw new Error("getFaq returned empty content for the default locale");
        }
        if (result.fallbackLocale) {
          throw new Error("getFaq flagged a fallback for the default locale itself");
        }
      },
    },
    {
      name: "getFaq falls back to real default-locale content (not empty) for a locale gap",
      async run(port) {
        const result = await port.getFaq("pt");
        if (result.data.length === 0) {
          throw new Error("getFaq returned empty content instead of a default-locale fallback");
        }
        if (!result.fallbackLocale) {
          throw new Error("getFaq did not flag fallbackLocale for a locale gap");
        }
      },
    },
    {
      name: "getMenu returns non-empty content for a known tier/locale",
      async run(port) {
        const result = await port.getMenu("VOYAGER", "es");
        if (result.data.length === 0) {
          throw new Error("getMenu returned empty content for a known tier/locale");
        }
      },
    },
    {
      name: "getMenu falls back to real default-tier content (not empty) for an unconfigured tier",
      async run(port) {
        const result = await port.getMenu("FIRST_CLASS", "es");
        if (result.data.length === 0) {
          throw new Error("getMenu returned empty content instead of a default-tier fallback");
        }
        if (!result.fallbackTier) {
          throw new Error("getMenu did not flag fallbackTier for an unconfigured tier");
        }
      },
    },
    {
      name: "getDestination returns non-empty content per section",
      async run(port) {
        for (const section of ["poi_map", "how_to_get_there", "circuits"] as const) {
          const result = await port.getDestination(section, "es");
          if (!result.data.title || !result.data.body) {
            throw new Error(`getDestination("${section}") returned incomplete content`);
          }
        }
      },
    },
    {
      name: "getMedia returns a non-empty, readable body for a known media id",
      async run(port) {
        const result = await port.getMedia("MEDIA-POI-MAP");
        if (typeof result.contentType !== "string" || result.contentType.length === 0) {
          throw new Error("getMedia did not return a non-empty contentType");
        }
        const bytes = await drain(result.body);
        if (bytes.length === 0) {
          throw new Error("getMedia returned an empty body for a known media id");
        }
      },
    },
  ],
};
