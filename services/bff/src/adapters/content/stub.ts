import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ContentResult, FaqEntry, Locale, MenuSection, RichContent, ServiceTier } from "contracts";
import { resolveLocalizedContent, resolveTieredContent } from "contracts";
import {
  ContentMediaNotFoundError,
  DestinationSectionNotFoundError,
  isDestinationSection,
  type ContentPort,
  type DestinationSection,
} from "../../modules/content/ports.js";
import { createContentCache, type ContentCache } from "../../modules/content/content-cache.js";
import {
  SeedDestinationSchema,
  SeedFaqSchema,
  SeedMediaSchema,
  SeedMenuSchema,
  type SeedDestination,
  type SeedFaq,
  type SeedMedia,
  type SeedMenu,
} from "./seed-schema.js";

export interface ContentStub extends ContentPort {
  /** Test/dev-only: makes the next call to any `ContentPort` method reject once, then succeed normally. */
  simulateFailureOnce(): void;
}

export interface ContentStubOptions {
  /** CMS source/default locale (design Decision 10: "locale -> source locale `es`"). */
  defaultLocale?: Locale;
  /** CMS default/base tier (design Decision 10: "tier -> default tier"). */
  defaultTier?: ServiceTier;
  /** Cache TTL passed to each resource's `ContentCache` (task 9.1). */
  cacheTtlMs?: number;
  /** Injectable clock for deterministic cache tests; defaults to `Date.now`. */
  now?: () => number;
}

const DEFAULT_LOCALE: Locale = "es";
const DEFAULT_TIER: ServiceTier = "VOYAGER";

/**
 * Resolves `services/bff/seed/content/<file>` relative to this module's own
 * file location — same convention as `adapters/sir-booking/stub.ts` (task
 * 5.1), so the path resolves correctly whether run from `src` or `dist`.
 */
function seedFilePath(file: string): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return join(moduleDir, "..", "..", "..", "seed", "content", file);
}

function loadSeedFile<T>(file: string, schema: { parse(input: unknown): T }): T {
  const raw: unknown = JSON.parse(readFileSync(seedFilePath(file), "utf-8"));
  return schema.parse(raw);
}

let cachedFaq: SeedFaq | undefined;
let cachedMenu: SeedMenu | undefined;
let cachedDestination: SeedDestination | undefined;
let cachedMedia: SeedMedia | undefined;

function loadFaqSeed(): SeedFaq {
  cachedFaq ??= loadSeedFile("faq.json", SeedFaqSchema);
  return cachedFaq;
}

function loadMenuSeed(): SeedMenu {
  cachedMenu ??= loadSeedFile("menu.json", SeedMenuSchema);
  return cachedMenu;
}

function loadDestinationSeed(): SeedDestination {
  cachedDestination ??= loadSeedFile("destination.json", SeedDestinationSchema);
  return cachedDestination;
}

function loadMediaSeed(): SeedMedia {
  cachedMedia ??= loadSeedFile("media.json", SeedMediaSchema);
  return cachedMedia;
}

function assertValidSection(section: string): asserts section is DestinationSection {
  if (!isDestinationSection(section)) {
    throw new DestinationSectionNotFoundError(section);
  }
}

/**
 * Deterministic, in-memory `ContentPort` stub (design Decision 6) backed by
 * the seed fixtures in `services/bff/seed/content/`. Headless CMS platform
 * not chosen (design Open Questions); this stands in until one is wired.
 */
export function createContentStub(options: ContentStubOptions = {}): ContentStub {
  const defaultLocale = options.defaultLocale ?? DEFAULT_LOCALE;
  const defaultTier = options.defaultTier ?? DEFAULT_TIER;
  const cacheOptions = {
    ...(options.cacheTtlMs !== undefined ? { ttlMs: options.cacheTtlMs } : {}),
    ...(options.now !== undefined ? { now: options.now } : {}),
  };

  const faqCache: ContentCache<ContentResult<FaqEntry[]>> = createContentCache(cacheOptions);
  const menuCache: ContentCache<ContentResult<MenuSection[]>> = createContentCache(cacheOptions);
  const destinationCache: ContentCache<ContentResult<RichContent>> = createContentCache(cacheOptions);

  let failNext = false;
  function consumeFailureInjection(): void {
    if (failNext) {
      failNext = false;
      throw new Error("simulated ContentPort failure");
    }
  }

  return {
    simulateFailureOnce() {
      failNext = true;
    },

    async getFaq(locale: Locale): Promise<ContentResult<FaqEntry[]>> {
      consumeFailureInjection();
      const entry = await faqCache.get(`faq:${locale}`, async () => {
        const resolved = resolveLocalizedContent({
          byLocale: loadFaqSeed(),
          requestedLocale: locale,
          defaultLocale,
        });
        return {
          data: resolved.data,
          locale: resolved.locale,
          fallbackLocale: resolved.fallbackLocale,
          fallbackTier: false,
          etag: "",
        };
      });
      return { ...entry.data, etag: entry.etag };
    },

    async getMenu(tier: ServiceTier, locale: Locale): Promise<ContentResult<MenuSection[]>> {
      consumeFailureInjection();
      const entry = await menuCache.get(`menu:${tier}:${locale}`, async () => {
        const tiered = resolveTieredContent({
          byTier: loadMenuSeed(),
          requestedTier: tier,
          defaultTier,
        });
        const localized = resolveLocalizedContent({
          byLocale: tiered.data,
          requestedLocale: locale,
          defaultLocale,
        });
        return {
          data: localized.data,
          locale: localized.locale,
          fallbackLocale: localized.fallbackLocale,
          fallbackTier: tiered.fallbackTier,
          etag: "",
        };
      });
      return { ...entry.data, etag: entry.etag };
    },

    async getDestination(
      section: DestinationSection,
      locale: Locale,
    ): Promise<ContentResult<RichContent>> {
      consumeFailureInjection();
      assertValidSection(section);
      const entry = await destinationCache.get(`destination:${section}:${locale}`, async () => {
        const bySection = loadDestinationSeed()[section];
        if (!bySection) {
          throw new DestinationSectionNotFoundError(section);
        }
        const resolved = resolveLocalizedContent({
          byLocale: bySection,
          requestedLocale: locale,
          defaultLocale,
        });
        return {
          data: resolved.data,
          locale: resolved.locale,
          fallbackLocale: resolved.fallbackLocale,
          fallbackTier: false,
          etag: "",
        };
      });
      return { ...entry.data, etag: entry.etag };
    },

    async getMedia(id: string): Promise<{ contentType: string; body: NodeJS.ReadableStream }> {
      consumeFailureInjection();
      const entry = loadMediaSeed()[id];
      if (!entry) {
        throw new ContentMediaNotFoundError(id);
      }
      return { contentType: entry.contentType, body: Readable.from(Buffer.from(entry.text)) };
    },
  };
}
