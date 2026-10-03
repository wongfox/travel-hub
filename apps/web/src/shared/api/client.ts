import { ErrorEnvelopeSchema, type ErrorCode } from "contracts";

/**
 * Thrown when the BFF returns a non-ok response whose body matches the
 * uniform error envelope (`{ code, requestId }`, design-interfaces "Error
 * envelope"). Callers branch on `error.code` — the server never sends a
 * localized message; the UI translates the code (design Decision 14).
 */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly requestId: string;
  readonly status: number;

  constructor(code: ErrorCode, requestId: string, status: number) {
    super(`API error "${code}" (requestId=${requestId}, status=${status})`);
    this.name = "ApiError";
    this.code = code;
    this.requestId = requestId;
    this.status = status;
  }
}

/**
 * Thrown when a non-ok response's body does not match the error envelope
 * schema at all (e.g. an upstream proxy error page, a network gateway
 * timeout body). Kept distinct from `ApiError` so callers never have to
 * treat a fabricated/guessed error code as if the server actually sent it.
 */
export class UnparsableApiError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`API returned status ${status} with a body that did not match the error envelope`);
    this.name = "UnparsableApiError";
    this.status = status;
  }
}

export interface ApiClientOptions {
  /** Prefixed onto every request path. Empty by default (design: web and API share one origin). */
  baseUrl?: string;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

export interface ApiRequestInit extends Omit<RequestInit, "body"> {
  /**
   * JSON-serializable request body; serialized here so callers never call `JSON.stringify` themselves.
   * A `FormData` body is sent as-is (multipart) with no `Content-Type`, so the browser sets the boundary.
   */
  body?: unknown;
}

export interface ApiClient {
  get<T>(path: string, init?: ApiRequestInit): Promise<T>;
  post<T>(path: string, body?: unknown, init?: ApiRequestInit): Promise<T>;
  delete<T>(path: string, init?: ApiRequestInit): Promise<T>;
}

/**
 * Same-origin fetch wrapper (task 4.4). Parses the BFF's uniform error
 * envelope on non-ok responses into a typed `ApiError` instead of leaving
 * every call site to re-parse JSON and guess at the error shape.
 */
export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const baseUrl = options.baseUrl ?? "";

  async function request<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
    // Resolved per call (not captured once at creation time) so a
    // module-level singleton client (e.g. `route-tree.tsx`'s
    // `defaultApiClient`) still observes a `fetch` replaced or stubbed
    // after the client was constructed.
    const fetchImpl = options.fetchImpl ?? fetch;
    const { body, headers, credentials, ...rest } = init;

    const isForm = typeof FormData !== "undefined" && body instanceof FormData;
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...rest,
      credentials: credentials ?? "same-origin",
      headers: {
        ...(body !== undefined && !isForm ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body === undefined ? null : isForm ? (body as FormData) : JSON.stringify(body),
    });

    if (!response.ok) {
      const raw: unknown = await response.json().catch(() => undefined);
      const parsed = ErrorEnvelopeSchema.safeParse(raw);
      if (parsed.success) {
        throw new ApiError(parsed.data.code, parsed.data.requestId, response.status);
      }
      throw new UnparsableApiError(response.status);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  return {
    get: <T>(path: string, init?: ApiRequestInit) => request<T>(path, { ...init, method: "GET" }),
    post: <T>(path: string, body?: unknown, init?: ApiRequestInit) =>
      request<T>(path, { ...init, method: "POST", body }),
    delete: <T>(path: string, init?: ApiRequestInit) =>
      request<T>(path, { ...init, method: "DELETE" }),
  };
}
