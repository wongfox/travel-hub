import type { Locale } from "contracts";

/**
 * Persisted shape of one `session` row (design's Data Model /
 * `services/bff/src/infra/db/schema.ts`, task 3.3). Same convention as
 * `AccessLinkStore` (task 5.2): a small port so session-exchange logic
 * (task 5.3) is unit testable deterministically without a live Postgres. A
 * Drizzle-backed adapter lands once a caller needs it against a live
 * database.
 */
export interface SessionRecord {
  idHash: string;
  linkId: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  locale: Locale;
  userAgentClass: string | null;
}

export interface CreateSessionInput {
  linkId: string;
  expiresAt: string;
  locale: Locale;
  userAgentClass?: string | null;
}

export interface SessionStore {
  /** `idHash` is the SHA-256 hash of the raw session id — the raw value is never persisted (design Decision 4). */
  create(idHash: string, input: CreateSessionInput): Promise<SessionRecord>;
  findByIdHash(idHash: string): Promise<SessionRecord | null>;
  deleteByIdHash(idHash: string): Promise<void>;
}

export function createInMemorySessionStore(now: () => Date = () => new Date()): SessionStore {
  const byIdHash = new Map<string, SessionRecord>();

  return {
    async create(idHash: string, input: CreateSessionInput): Promise<SessionRecord> {
      if (byIdHash.has(idHash)) {
        throw new Error("session id hash already exists");
      }
      const stamp = now().toISOString();
      const record: SessionRecord = {
        idHash,
        linkId: input.linkId,
        createdAt: stamp,
        lastSeenAt: stamp,
        expiresAt: input.expiresAt,
        locale: input.locale,
        userAgentClass: input.userAgentClass ?? null,
      };
      byIdHash.set(idHash, record);
      return { ...record };
    },

    async findByIdHash(idHash: string): Promise<SessionRecord | null> {
      const record = byIdHash.get(idHash);
      return record ? { ...record } : null;
    },

    async deleteByIdHash(idHash: string): Promise<void> {
      byIdHash.delete(idHash);
    },
  };
}
