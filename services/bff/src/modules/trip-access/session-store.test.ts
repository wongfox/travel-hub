import { describe, expect, it } from "vitest";
import { createInMemorySessionStore } from "./session-store.js";

describe("createInMemorySessionStore", () => {
  it("creates and finds a session by its id hash", async () => {
    const store = createInMemorySessionStore();

    const record = await store.create("hash-1", {
      linkId: "link-1",
      expiresAt: "2026-01-08T00:00:00.000Z",
      locale: "es",
    });

    expect(record.idHash).toBe("hash-1");
    expect(record.linkId).toBe("link-1");
    expect(record.locale).toBe("es");
    expect(record.userAgentClass).toBeNull();

    const found = await store.findByIdHash("hash-1");
    expect(found).toEqual(record);
  });

  it("returns null for an unknown id hash", async () => {
    const store = createInMemorySessionStore();

    expect(await store.findByIdHash("does-not-exist")).toBeNull();
  });

  it("stores an explicit userAgentClass when provided", async () => {
    const store = createInMemorySessionStore();

    const record = await store.create("hash-2", {
      linkId: "link-2",
      expiresAt: "2026-01-08T00:00:00.000Z",
      locale: "en",
      userAgentClass: "mobile-webview",
    });

    expect(record.userAgentClass).toBe("mobile-webview");
  });

  it("deletes a session by id hash, after which it can no longer be found", async () => {
    const store = createInMemorySessionStore();
    await store.create("hash-3", { linkId: "link-3", expiresAt: "2026-01-08T00:00:00.000Z", locale: "pt" });

    await store.deleteByIdHash("hash-3");

    expect(await store.findByIdHash("hash-3")).toBeNull();
  });

  it("deleting an unknown id hash is a harmless no-op", async () => {
    const store = createInMemorySessionStore();

    await expect(store.deleteByIdHash("never-existed")).resolves.toBeUndefined();
  });

  it("keeps two sessions for different links independent", async () => {
    const store = createInMemorySessionStore();
    await store.create("hash-a", { linkId: "link-a", expiresAt: "2026-01-08T00:00:00.000Z", locale: "es" });
    await store.create("hash-b", { linkId: "link-b", expiresAt: "2026-01-09T00:00:00.000Z", locale: "en" });

    const a = await store.findByIdHash("hash-a");
    const b = await store.findByIdHash("hash-b");

    expect(a?.linkId).toBe("link-a");
    expect(b?.linkId).toBe("link-b");
  });
});
