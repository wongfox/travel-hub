import { eq } from "drizzle-orm";
import type { Locale } from "contracts";
import type { Db } from "../../infra/db/client.js";
import { session } from "../../infra/db/schema.js";
import type { CreateSessionInput, SessionRecord, SessionStore } from "../../modules/trip-access/session-store.js";

type SessionRow = typeof session.$inferSelect;

function toRecord(row: SessionRow): SessionRecord {
  return {
    idHash: row.idHash,
    linkId: row.linkId,
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    locale: row.locale as Locale,
    userAgentClass: row.userAgentClass,
  };
}

/**
 * Postgres/Drizzle `SessionStore` over `session`, shared by every `bff-api`
 * instance (a session created on one instance validates on the others).
 *
 * SECURITY: `idHash` is the SHA-256 hex digest of the `__Host-th_sess` cookie
 * value, computed by the callers; this adapter never sees the raw session id and
 * never logs or throws a hash. `id_hash` is the primary key, so a duplicate is
 * rejected (never overwritten) even when two exchanges race; the foreign key
 * keeps every session bound to a real `access_link`. `expiresAt` is persisted
 * verbatim and NOT judged here (`resolveActiveSession` and `GET /api/session`
 * compare it to their clock, boundary = expired).
 */
export function createPostgresSessionStore(db: Db, now: () => Date = () => new Date()): SessionStore {
  return {
    async create(idHash: string, input: CreateSessionInput): Promise<SessionRecord> {
      const stamp = now();
      const [row] = await db
        .insert(session)
        .values({
          idHash,
          linkId: input.linkId,
          createdAt: stamp,
          lastSeenAt: stamp,
          expiresAt: new Date(input.expiresAt),
          locale: input.locale,
          userAgentClass: input.userAgentClass ?? null,
        })
        .returning();
      if (!row) throw new Error("session insert returned no row");
      return toRecord(row);
    },

    async findByIdHash(idHash: string): Promise<SessionRecord | null> {
      const [row] = await db.select().from(session).where(eq(session.idHash, idHash)).limit(1);
      return row ? toRecord(row) : null;
    },

    async deleteByIdHash(idHash: string): Promise<void> {
      await db.delete(session).where(eq(session.idHash, idHash));
    },
  };
}
