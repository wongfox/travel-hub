import { describe, expect, it, vi } from "vitest";
import { createContentCache } from "./content-cache.js";

describe("createContentCache", () => {
  it("calls the loader once and returns its data with a computed etag on first access", async () => {
    const cache = createContentCache<{ value: string }>();
    const loader = vi.fn().mockResolvedValue({ value: "hello" });

    const entry = await cache.get("key-1", loader);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(entry.data).toEqual({ value: "hello" });
    expect(entry.etag).toEqual(expect.any(String));
    expect(entry.etag.length).toBeGreaterThan(0);
  });

  it("returns the cached entry without calling the loader again while still fresh", async () => {
    let now = 0;
    const cache = createContentCache<{ value: string }>({ ttlMs: 1000, now: () => now });
    const loader = vi.fn().mockResolvedValue({ value: "hello" });

    const first = await cache.get("key-1", loader);
    now += 500; // still within the 1000ms TTL
    const second = await cache.get("key-1", loader);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it("produces the same etag for identical data and a different etag for different data", async () => {
    const cache = createContentCache<{ value: string }>();

    const a = await cache.get("key-a", async () => ({ value: "same" }));
    const b = await cache.get("key-b", async () => ({ value: "same" }));
    const c = await cache.get("key-c", async () => ({ value: "different" }));

    expect(a.etag).toBe(b.etag);
    expect(a.etag).not.toBe(c.etag);
  });

  it("stale-while-revalidate: returns the stale entry immediately once the TTL elapses, then refreshes in the background", async () => {
    let now = 0;
    const cache = createContentCache<{ value: string }>({ ttlMs: 1000, now: () => now });
    const loader = vi
      .fn()
      .mockResolvedValueOnce({ value: "v1" })
      .mockResolvedValueOnce({ value: "v2" });

    const first = await cache.get("key-1", loader);
    expect(first.data).toEqual({ value: "v1" });

    now += 1500; // past the TTL
    const stale = await cache.get("key-1", loader);
    // The stale value is returned immediately, not the not-yet-resolved v2.
    expect(stale.data).toEqual({ value: "v1" });

    await cache.waitForRevalidation("key-1");
    expect(loader).toHaveBeenCalledTimes(2);

    now += 0; // still "fresh" relative to the just-completed revalidation
    const refreshed = await cache.get("key-1", loader);
    expect(refreshed.data).toEqual({ value: "v2" });
  });

  it("keeps serving the stale entry when background revalidation fails", async () => {
    let now = 0;
    const cache = createContentCache<{ value: string }>({ ttlMs: 1000, now: () => now });
    const loader = vi
      .fn()
      .mockResolvedValueOnce({ value: "v1" })
      .mockRejectedValueOnce(new Error("cms unavailable"));

    await cache.get("key-1", loader);
    now += 1500;
    const stale = await cache.get("key-1", loader);
    expect(stale.data).toEqual({ value: "v1" });

    await expect(cache.waitForRevalidation("key-1")).resolves.toBeUndefined();

    const stillStale = await cache.get("key-1", loader);
    expect(stillStale.data).toEqual({ value: "v1" });
  });
});
