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
 * Non-plain objects (class instances, Buffers, etc.) and already-visited
 * objects (cycle guard) pass through unchanged rather than being recursed
 * into, since real logger payloads (e.g. Fastify's request/response
 * objects) can be deeply nested engine internals or self-referencing.
 */
export function redactLogPayload(payload: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (Array.isArray(payload)) {
    if (seen.has(payload)) return payload;
    seen.add(payload);
    return payload.map((item) => redactLogPayload(item, seen));
  }

  if (isPlainObject(payload)) {
    if (seen.has(payload)) return payload;
    seen.add(payload);
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (isDenylistedKey(key) || looksLikeEmail(value)) {
        result[key] = REDACTED;
      } else {
        result[key] = redactLogPayload(value, seen);
      }
    }
    return result;
  }

  return payload;
}
