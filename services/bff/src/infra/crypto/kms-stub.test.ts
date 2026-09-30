import { describe, expect, it } from "vitest";
import { createKmsStub } from "./kms-stub.js";

describe("createKmsStub", () => {
  it("generates a 32-byte plaintext data key and a wrapped form that round-trips through unwrap", async () => {
    const kms = createKmsStub();

    const { plaintext, wrapped } = await kms.generateDataKey("key-1");

    expect(plaintext).toHaveLength(32);
    expect(wrapped.equals(plaintext)).toBe(false);

    const unwrapped = await kms.unwrap(wrapped, "key-1", "worker-actor");
    expect(unwrapped.equals(plaintext)).toBe(true);
  });

  it("rejects unwrap with an unrecognized wrapped key or the wrong keyId, proving it is not a pass-through", async () => {
    const kms = createKmsStub();
    const { wrapped } = await kms.generateDataKey("key-1");

    await expect(kms.unwrap(Buffer.from("not-a-real-wrapped-key"), "key-1", "actor")).rejects.toThrow();
    await expect(kms.unwrap(wrapped, "key-2", "actor")).rejects.toThrow();
  });

  it("supports failure injection for a given keyId, per design Decision 6's stub requirements", async () => {
    const kms = createKmsStub();
    kms.simulateGenerateFailureOnce("broken-key");

    await expect(kms.generateDataKey("broken-key")).rejects.toThrow(/simulated/i);
    // The injected failure is one-shot: a second call for the same key succeeds.
    await expect(kms.generateDataKey("broken-key")).resolves.toBeDefined();
  });
});
