import { describe, expect, it, vi } from "vitest";
import { checkRemoteKill, type KillSwitchDeps } from "./kill-switch.js";

function makeDeps(overrides: Partial<KillSwitchDeps> = {}): KillSwitchDeps {
  return {
    fetchImpl: vi.fn(),
    cachesImpl: { keys: vi.fn().mockResolvedValue([]), delete: vi.fn() },
    unregister: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe("checkRemoteKill", () => {
  it("clears every cache and unregisters when /sw-kill.json reports killed: true", async () => {
    const deps = makeDeps({
      fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({ killed: true }), { status: 200 })),
      cachesImpl: { keys: vi.fn().mockResolvedValue(["th-shell-v1", "th-docs-v1"]), delete: vi.fn() },
    });

    const result = await checkRemoteKill(deps);

    expect(result).toBe(true);
    expect(deps.cachesImpl.delete).toHaveBeenCalledWith("th-shell-v1");
    expect(deps.cachesImpl.delete).toHaveBeenCalledWith("th-docs-v1");
    expect(deps.unregister).toHaveBeenCalledOnce();
  });

  it("does nothing when the endpoint reports killed: false", async () => {
    const deps = makeDeps({
      fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({ killed: false }), { status: 200 })),
    });

    const result = await checkRemoteKill(deps);

    expect(result).toBe(false);
    expect(deps.cachesImpl.delete).not.toHaveBeenCalled();
    expect(deps.unregister).not.toHaveBeenCalled();
  });

  it("fails open (never unregisters) when the fetch rejects", async () => {
    const deps = makeDeps({ fetchImpl: vi.fn().mockRejectedValue(new Error("offline")) });

    const result = await checkRemoteKill(deps);

    expect(result).toBe(false);
    expect(deps.unregister).not.toHaveBeenCalled();
  });

  it("fails open when the response is not ok", async () => {
    const deps = makeDeps({ fetchImpl: vi.fn().mockResolvedValue(new Response(null, { status: 404 })) });

    const result = await checkRemoteKill(deps);

    expect(result).toBe(false);
    expect(deps.unregister).not.toHaveBeenCalled();
  });

  it("fails open when the response body is not valid JSON", async () => {
    const deps = makeDeps({ fetchImpl: vi.fn().mockResolvedValue(new Response("not json", { status: 200 })) });

    const result = await checkRemoteKill(deps);

    expect(result).toBe(false);
    expect(deps.unregister).not.toHaveBeenCalled();
  });

  it("requests /sw-kill.json without a stale cached response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ killed: false }), { status: 200 }));
    const deps = makeDeps({ fetchImpl });

    await checkRemoteKill(deps);

    expect(fetchImpl).toHaveBeenCalledWith("/sw-kill.json", expect.objectContaining({ cache: "no-store" }));
  });
});
