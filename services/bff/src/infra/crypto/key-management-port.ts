/**
 * `KeyManagementPort` per `sdd/travel-hub-mvp/design-interfaces`
 * (`services/bff/src/modules/precheckin/ports.ts`). Declared here in
 * `infra/crypto` because the envelope-encryption helper (task 3.5) needs it
 * before the `precheckin` module exists (Phase 8); that module re-uses this
 * same type once it lands rather than redeclaring it.
 */
export interface KeyManagementPort {
  generateDataKey(keyId: string): Promise<{ plaintext: Buffer; wrapped: Buffer }>;
  /** `actor` is recorded by real adapters for `pii_access_audit` (design Security section). */
  unwrap(wrapped: Buffer, keyId: string, actor: string): Promise<Buffer>;
}
