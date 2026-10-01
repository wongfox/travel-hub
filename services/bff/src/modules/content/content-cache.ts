import { createHash } from "node:crypto";

/**
 * BFF-side `content_cache` mechanism (task 9.1, design Decision 10: "BFF
 * caches normalized DTOs ... with ETag, stale-while-revalidate, configurable
 * TTL"). No Postgres `content_cache` table is wired yet — same precedent as
 * `pii_access_audit`'s in-memory `PiiAccessAuditPort` (WU16): the schema
 * shape (key, etag, body, fetchedAt) matches the design's Data Model so a
 * Drizzle-backed adapter can replace this in-memory store without changing
 * any caller, once a consumer needs it to survive a process restart.
 */
export interface ContentCacheEntry<T> {
  data: T;
  etag: string;
  fetchedAt: number;
}

export interface ContentCacheOptions {
  /** How long an entry stays fresh before stale-while-revalidate kicks in. Defaults to 5 minutes. */
  ttlMs?: number;
  /** Injectable clock for deterministic tests; defaults to `Date.now`. */
  now?: () => number;
}

export interface ContentCache<T> {
  /**
   * Returns the cached entry for `key`. A missing entry blocks on `loader`
   * (first paint must have real data). A stale entry (older than `ttlMs`) is
   * returned immediately while `loader` re-runs in the background — a slow
   * or unavailable CMS call never blocks a request that already has cached
   * content (stale-while-revalidate).
   */
  get(key: string, loader: () => Promise<T>): Promise<ContentCacheEntry<T>>;
  /** Test/dev-only: resolves once any in-flight background revalidation for `key` settles (success or failure). */
  waitForRevalidation(key: string): Promise<void>;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;

function computeEtag(data: unknown): string {
  return createHash("sha1").update(JSON.stringify(data)).digest("hex");
}

export function createContentCache<T>(options: ContentCacheOptions = {}): ContentCache<T> {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const now = options.now ?? (() => Date.now());
  const store = new Map<string, ContentCacheEntry<T>>();
  const inflight = new Map<string, Promise<void>>();

  async function populate(key: string, loader: () => Promise<T>): Promise<ContentCacheEntry<T>> {
    const data = await loader();
    const entry: ContentCacheEntry<T> = { data, etag: computeEtag(data), fetchedAt: now() };
    store.set(key, entry);
    return entry;
  }

  return {
    async get(key, loader) {
      const cached = store.get(key);
      if (!cached) {
        return populate(key, loader);
      }

      const isFresh = now() - cached.fetchedAt < ttlMs;
      if (isFresh) {
        return cached;
      }

      if (!inflight.has(key)) {
        const task = populate(key, loader)
          .then(() => undefined)
          .catch(() => {
            // A revalidation failure must never surface to a caller already
            // holding the stale entry — it just keeps serving stale content
            // until the next successful revalidation (design: a slow/unavailable
            // CMS never blocks the passenger-facing response).
          })
          .finally(() => inflight.delete(key));
        inflight.set(key, task);
      }
      return cached;
    },

    async waitForRevalidation(key) {
      await (inflight.get(key) ?? Promise.resolve());
    },
  };
}
