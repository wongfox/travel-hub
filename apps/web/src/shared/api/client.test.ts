import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, UnparsableApiError, createApiClient } from "./client.js";

describe("createApiClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses a successful JSON response", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const client = createApiClient({ fetchImpl });

    const result = await client.get<{ ok: boolean }>("/api/trip");

    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/trip",
      expect.objectContaining({ method: "GET", credentials: "same-origin" }),
    );
  });

  it("sends a JSON body and Content-Type header for a POST request", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const client = createApiClient({ fetchImpl });

    await client.post("/api/pulse", { legId: "leg-1", score: 4 });

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/pulse",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ legId: "leg-1", score: 4 }),
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      }),
    );
  });

  it("returns undefined for a 204 No Content response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const client = createApiClient({ fetchImpl });

    const result = await client.delete("/api/session");

    expect(result).toBeUndefined();
  });

  it("throws an ApiError parsed from the error envelope on a non-ok response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: "link_expired", requestId: "req-1" }), {
        status: 410,
      }),
    );
    const client = createApiClient({ fetchImpl });

    await expect(client.get("/api/trip")).rejects.toMatchObject({
      name: "ApiError",
      code: "link_expired",
      requestId: "req-1",
      status: 410,
    });
  });

  it("throws an instance of ApiError (not a plain object) so callers can use instanceof", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: "consent_required", requestId: "req-2" }), {
        status: 403,
      }),
    );
    const client = createApiClient({ fetchImpl });

    await expect(client.get("/api/trip")).rejects.toBeInstanceOf(ApiError);
  });

  it("throws an UnparsableApiError when the error body does not match the error envelope schema", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("not json", { status: 500 }));
    const client = createApiClient({ fetchImpl });

    await expect(client.get("/api/trip")).rejects.toBeInstanceOf(UnparsableApiError);
  });

  it("prefixes requests with baseUrl when provided", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    const client = createApiClient({ baseUrl: "https://example.test", fetchImpl });

    await client.get("/api/trip");

    expect(fetchImpl).toHaveBeenCalledWith("https://example.test/api/trip", expect.anything());
  });

  it("defaults to the global fetch when no fetchImpl is provided", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const client = createApiClient();

    await client.get("/api/trip");

    expect(fetchSpy).toHaveBeenCalled();
  });

  it("uses a later-stubbed global fetch even when the client was created before the stub (module-singleton pattern)", async () => {
    // Regression for a real bug: `route-tree.tsx` builds one module-level
    // `defaultApiClient` at import time, so any consumer that creates a
    // client before a test stubs `globalThis.fetch` must still observe the
    // stub on every request — not a `fetch` reference frozen at creation.
    const client = createApiClient();
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    const result = await client.get<{ ok: boolean }>("/api/trip");

    expect(result).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/trip",
      expect.objectContaining({ method: "GET", credentials: "same-origin" }),
    );
  });
});
