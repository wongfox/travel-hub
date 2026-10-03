import { describe, expect, it } from "vitest";
import { createPrecheckinDocumentStoreStub } from "./stub.js";

describe("createPrecheckinDocumentStoreStub", () => {
  it("stores ciphertext under a key and makes it unavailable after delete", async () => {
    const store = createPrecheckinDocumentStoreStub();
    const ciphertext = Buffer.from("encrypted-bytes");

    await store.put("obj-1", ciphertext);
    expect(store.contents.get("obj-1")).toEqual(ciphertext);

    await store.delete("obj-1");
    expect(store.contents.has("obj-1")).toBe(false);
  });

  it("keeps distinct keys independent", async () => {
    const store = createPrecheckinDocumentStoreStub();

    await store.put("photo-a", Buffer.from("photo-a-bytes"));
    await store.put("photo-b", Buffer.from("photo-b-bytes"));

    expect(store.contents.get("photo-a")).toEqual(Buffer.from("photo-a-bytes"));
    expect(store.contents.get("photo-b")).toEqual(Buffer.from("photo-b-bytes"));
  });

  it("simulates a put failure exactly once when armed", async () => {
    const store = createPrecheckinDocumentStoreStub();
    store.simulatePutFailureOnce();

    await expect(store.put("obj-2", Buffer.from("x"))).rejects.toThrow(
      /simulated PrecheckinDocumentStorePort put failure/,
    );

    await store.put("obj-2", Buffer.from("x"));
    expect(store.contents.get("obj-2")).toEqual(Buffer.from("x"));
  });

  it("deleting a key that was never stored does not throw", async () => {
    const store = createPrecheckinDocumentStoreStub();

    await expect(store.delete("never-stored")).resolves.toBeUndefined();
  });
});
