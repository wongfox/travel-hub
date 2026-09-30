import { randomBytes } from "node:crypto";
import type { KeyManagementPort } from "./key-management-port.js";

const DATA_KEY_LENGTH_BYTES = 32;

export interface KmsStub extends KeyManagementPort {
  /**
   * Test/dev-only: makes the next `generateDataKey` call for `keyId` reject
   * once with a simulated failure, then succeed normally afterward.
   */
  simulateGenerateFailureOnce(keyId: string): void;
}

interface WrappedRecord {
  keyId: string;
  plaintext: Buffer;
}

/**
 * Deterministic, in-memory `KeyManagementPort` stub per design Decision 6
 * (every external dependency gets a stub adapter first: deterministic,
 * seeded, with a failure-injection switch). This is not real cryptographic
 * key wrapping — it tags the plaintext data key with its `keyId` so
 * `unwrap` can validate the `keyId` matches and reject unknown/tampered
 * wrapped bytes, which is enough to prove `envelope-encryption`'s wiring
 * without a real AWS KMS dependency.
 */
export function createKmsStub(): KmsStub {
  const wrappedRecords = new Map<string, WrappedRecord>();
  const pendingGenerateFailures = new Set<string>();

  return {
    simulateGenerateFailureOnce(keyId: string) {
      pendingGenerateFailures.add(keyId);
    },

    async generateDataKey(keyId: string) {
      if (pendingGenerateFailures.delete(keyId)) {
        throw new Error(`simulated KMS generateDataKey failure for key "${keyId}"`);
      }
      const plaintext = randomBytes(DATA_KEY_LENGTH_BYTES);
      const wrapped = Buffer.concat([Buffer.from(`${keyId}:`, "utf8"), plaintext]);
      wrappedRecords.set(wrapped.toString("base64"), { keyId, plaintext });
      return { plaintext, wrapped };
    },

    async unwrap(wrapped: Buffer, keyId: string, actor: string) {
      const record = wrappedRecords.get(wrapped.toString("base64"));
      if (!record) {
        throw new Error(`unwrap failed for actor "${actor}": unknown wrapped data key`);
      }
      if (record.keyId !== keyId) {
        throw new Error(
          `unwrap failed for actor "${actor}": wrapped data key does not belong to keyId "${keyId}"`,
        );
      }
      return record.plaintext;
    },
  };
}
