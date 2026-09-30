import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getActiveLinkId, setActiveLinkId } from "./trip-prefs-store.js";

describe("trip prefs store", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns undefined when no active link id has ever been set", async () => {
    const result = await getActiveLinkId();

    expect(result).toBeUndefined();
  });

  it("round-trips the active link id (design Client-side 'prefs' store: active link id)", async () => {
    await setActiveLinkId("link-prefs-1");

    const result = await getActiveLinkId();

    expect(result).toBe("link-prefs-1");
  });

  it("overwrites the previous active link id when a different trip is opened", async () => {
    await setActiveLinkId("link-prefs-first");
    await setActiveLinkId("link-prefs-second");

    const result = await getActiveLinkId();

    expect(result).toBe("link-prefs-second");
  });

  it("never calls fetch when reading or writing the active link id", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await setActiveLinkId("link-prefs-2");
    await getActiveLinkId();

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
