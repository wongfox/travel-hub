import { describe, expect, it } from "vitest";
import { createKmsStub } from "./kms-stub.js";
import { decryptEnvelope, encryptEnvelope } from "./envelope-encryption.js";

describe("envelope encryption", () => {
  it("round-trips a plaintext buffer through encrypt then decrypt using a fake KeyManagementPort", async () => {
    const kms = createKmsStub();
    const plaintext = Buffer.from("passport-image-bytes-001", "utf8");

    const envelope = await encryptEnvelope(plaintext, kms, "precheckin-key");
    const decrypted = await decryptEnvelope(envelope, kms, "precheckin-key", "worker");

    expect(decrypted.equals(plaintext)).toBe(true);
    expect(envelope.ciphertext.equals(plaintext)).toBe(false);
  });

  it("round-trips a different plaintext and keyId, proving encryption is not hardcoded to one fixture", async () => {
    const kms = createKmsStub();
    const plaintext = Buffer.from("a completely different id-document payload", "utf8");

    const envelope = await encryptEnvelope(plaintext, kms, "another-key");
    const decrypted = await decryptEnvelope(envelope, kms, "another-key", "worker-2");

    expect(decrypted.equals(plaintext)).toBe(true);
  });

  it("fails to decrypt when the ciphertext has been tampered with, proving real AES-256-GCM integrity checking runs", async () => {
    const kms = createKmsStub();
    const plaintext = Buffer.from("sensitive bytes", "utf8");

    const envelope = await encryptEnvelope(plaintext, kms, "precheckin-key");
    const tampered = {
      ...envelope,
      ciphertext: Buffer.concat([envelope.ciphertext.subarray(0, -1), Buffer.from([0])]),
    };

    await expect(decryptEnvelope(tampered, kms, "precheckin-key", "worker")).rejects.toThrow();
  });
});
