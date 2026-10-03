import { describe, expect, it } from "vitest";
import { runConformanceSuite } from "../_conformance-harness/conformance-harness.js";
import { createContentStub } from "./stub.js";
import { contentContract } from "./content.contract.js";
import type { ContentPort } from "../../modules/content/ports.js";

describe("ContentPort conformance", () => {
  it("passes the full conformance suite against the stub adapter", async () => {
    await expect(runConformanceSuite(createContentStub, contentContract)).resolves.toBeUndefined();
  });

  it("fails the conformance suite against an adapter that deviates from the documented contract (empty content instead of a locale fallback)", async () => {
    function createBrokenAdapter(): ContentPort {
      return {
        async getFaq(locale) {
          // Broken: returns empty content for a locale gap instead of falling
          // back to the default locale (the exact bug class task 9.1's
          // acceptance criterion exists to catch) — but still returns real
          // content for the default locale itself, so the conformance
          // failure is specifically attributable to the fallback case.
          if (locale === "es") {
            return {
              data: [{ id: "x", question: "q", answer: "a" }],
              locale: "es",
              fallbackLocale: false,
              fallbackTier: false,
              etag: "x",
            };
          }
          return { data: [], locale, fallbackLocale: true, fallbackTier: false, etag: "x" };
        },
        async getMenu() {
          return { data: [], locale: "es", fallbackLocale: false, fallbackTier: false, etag: "x" };
        },
        async getDestination() {
          return {
            data: { title: "t", body: "b" },
            locale: "es",
            fallbackLocale: false,
            fallbackTier: false,
            etag: "x",
          };
        },
        async getMedia() {
          throw new Error("not used by this broken adapter's failing case");
        },
      };
    }

    await expect(runConformanceSuite(createBrokenAdapter, contentContract)).rejects.toThrow(
      /fallback/i,
    );
  });
});
