import type { PrecheckinDocumentStorePort } from "../../modules/precheckin/ports.js";

export interface PrecheckinDocumentStoreStub extends PrecheckinDocumentStorePort {
  /** Test/dev-only introspection: every object currently "stored" by this instance. */
  readonly contents: Map<string, Buffer>;
  /** Test/dev-only: makes the next `put` call reject once, then succeed normally. */
  simulatePutFailureOnce(): void;
}

/**
 * Deterministic, in-memory `PrecheckinDocumentStorePort` stub per design
 * Decision 6 (every external dependency gets a stub adapter first:
 * deterministic, seeded, failure-injection switch). Stands in for the real
 * S3-compatible bucket (design Decision 3) until one is wired.
 */
export function createPrecheckinDocumentStoreStub(): PrecheckinDocumentStoreStub {
  const contents = new Map<string, Buffer>();
  let failNextPut = false;

  return {
    contents,

    simulatePutFailureOnce() {
      failNextPut = true;
    },

    async put(key: string, ciphertext: Buffer): Promise<void> {
      if (failNextPut) {
        failNextPut = false;
        throw new Error("simulated PrecheckinDocumentStorePort put failure");
      }
      contents.set(key, ciphertext);
    },

    async delete(key: string): Promise<void> {
      contents.delete(key);
    },
  };
}
