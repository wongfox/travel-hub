export interface RateLimiter {
  /** Returns `true` if this call is allowed; `false` if `key` has exceeded its limit for the current window. */
  consume(key: string): boolean;
}

export interface InMemoryRateLimiterOptions {
  max: number;
  windowMs: number;
  /** Injectable clock for deterministic tests; defaults to `Date.now`. */
  now?: () => number;
}

/**
 * Fixed-window in-memory rate limiter used by `trip-link-access`'s
 * session-exchange and reissue routes (task 5.3's "Rate limiting on token
 * validation" acceptance criterion; design's Security section also names
 * `/api/links/reissue`). Deliberately a small injectable port rather than
 * relying solely on the already-globally-registered `@fastify/rate-limit`
 * plugin (task 3.6), so these specific routes' stricter thresholds stay
 * unit-testable via Fastify `.inject()` without requiring the full app's
 * security-plugin stack in every test — the same DI convention already
 * established by `AccessLinkStore`/`QueueClient`.
 */
export function createInMemoryRateLimiter(options: InMemoryRateLimiterOptions): RateLimiter {
  const now = options.now ?? (() => Date.now());
  const hitsByKey = new Map<string, number[]>();

  return {
    consume(key: string): boolean {
      const currentTime = now();
      const windowStart = currentTime - options.windowMs;
      const recentHits = (hitsByKey.get(key) ?? []).filter((hitAt) => hitAt > windowStart);

      if (recentHits.length >= options.max) {
        hitsByKey.set(key, recentHits);
        return false;
      }

      recentHits.push(currentTime);
      hitsByKey.set(key, recentHits);
      return true;
    },
  };
}
