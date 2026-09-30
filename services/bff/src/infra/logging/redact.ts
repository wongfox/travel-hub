/**
 * Structured-log redaction with an explicit denylist (design Security
 * section): tokens, cookies, images, emails, and payment data are never
 * logged; reservation references are never logged raw (only as
 * `trip_hash`, computed elsewhere in the analytics module).
 */
const REDACTED = "[REDACTED]";

const DENYLISTED_KEY_PATTERNS: RegExp[] = [
  /token/i,
  /cookie/i,
  /password/i,
  /authorization/i,
  /email/i,
  /card(number)?/i,
  /cvv/i,
  /cvc/i,
  /photo/i,
  /image/i,
  /idfront/i,
  /idback/i,
  /reservationref/i,
];

const EMAIL_VALUE_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/;

function isDenylistedKey(key: string): boolean {
  return DENYLISTED_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function looksLikeEmail(value: unknown): value is string {
  return typeof value === "string" && EMAIL_VALUE_PATTERN.test(value);
}

/**
 * True only for plain data objects (`{}` or `Object.create(null)`) — the
 * shape JSON payloads and log fields normally take. Class instances
 * (sockets, streams, Error, Buffer, Date, etc.) are excluded so real
 * Fastify request/response log objects — which nest engine internals that
 * can self-reference — are never recursed into.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Recursively redacts a log payload: denylisted field names are replaced
 * outright, and string values that look like an email are redacted even
 * under an unrecognized key (defense in depth against key-naming misses).
 * Non-plain objects (class instances, Buffers, etc.) pass through
 * unchanged rather than being recursed into, since real logger payloads
 * (e.g. Fastify's request/response objects) can be deeply nested engine
 * internals.
 *
 * `ancestors` tracks the objects currently being processed on this
 * recursion path — an object seen here is a genuine cycle (self-reference),
 * so it passes through raw rather than recursing forever. `cache` tracks
 * objects that have *finished* processing — an object seen here was
 * reached again from a different, non-circular branch (e.g. the same
 * object referenced under two sibling keys), so its already-computed
 * redacted result is reused instead of returning the original, unredacted
 * object.
 */
export function redactLogPayload(
  payload: unknown,
  ancestors: WeakSet<object> = new WeakSet(),
  cache: WeakMap<object, unknown> = new WeakMap(),
): unknown {
  if (Array.isArray(payload)) {
    if (ancestors.has(payload)) return payload;
    if (cache.has(payload)) return cache.get(payload);
    ancestors.add(payload);
    const result = payload.map((item) => redactLogPayload(item, ancestors, cache));
    ancestors.delete(payload);
    cache.set(payload, result);
    return result;
  }

  if (isPlainObject(payload)) {
    if (ancestors.has(payload)) return payload;
    if (cache.has(payload)) return cache.get(payload);
    ancestors.add(payload);
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (isDenylistedKey(key) || looksLikeEmail(value)) {
        result[key] = REDACTED;
      } else {
        result[key] = redactLogPayload(value, ancestors, cache);
      }
    }
    ancestors.delete(payload);
    cache.set(payload, result);
    return result;
  }

  return payload;
}
