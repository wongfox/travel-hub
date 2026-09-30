import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { KeyManagementPort } from "./key-management-port.js";

/**
 * Per-submission envelope encryption (design's pre check-in Security
 * section): a fresh 256-bit DEK from KMS, AES-256-GCM per object with a
 * unique IV, the DEK stored only in its wrapped form. Callers persist the
 * returned envelope's `wrappedDataKey`/`iv`/`authTag` alongside the
 * ciphertext; only `decryptEnvelope` (the `worker` role, per the design)
 * ever unwraps the plaintext DEK.
 */
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;

export interface EncryptedEnvelope {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
  wrappedDataKey: Buffer;
}

export async function encryptEnvelope(
  plaintext: Buffer,
  kms: KeyManagementPort,
  keyId: string,
): Promise<EncryptedEnvelope> {
  const { plaintext: dataKey, wrapped: wrappedDataKey } = await kms.generateDataKey(keyId);
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, dataKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext, iv, authTag, wrappedDataKey };
}

export async function decryptEnvelope(
  envelope: EncryptedEnvelope,
  kms: KeyManagementPort,
  keyId: string,
  actor: string,
): Promise<Buffer> {
  const dataKey = await kms.unwrap(envelope.wrappedDataKey, keyId, actor);
  const decipher = createDecipheriv(ALGORITHM, dataKey, envelope.iv);
  decipher.setAuthTag(envelope.authTag);
  return Buffer.concat([decipher.update(envelope.ciphertext), decipher.final()]);
}
