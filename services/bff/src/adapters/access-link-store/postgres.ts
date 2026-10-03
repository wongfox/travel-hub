import { and, asc, desc, eq, isNull, lt, sql } from "drizzle-orm";
import type { Db } from "../../infra/db/client.js";
import { accessLink } from "../../infra/db/schema.js";
import type {
  AccessLinkRecord,
  AccessLinkStore,
  CreateAccessLinkInput,
} from "../../modules/trip-access/access-link-store.js";

type AccessLinkRow = typeof accessLink.$inferSelect;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toRecord(row: AccessLinkRow): AccessLinkRecord {
  return {
    id: row.id,
    tokenHash: row.tokenHash,
    reservationRef: row.reservationRef,
    passengerScope: row.passengerScope,
    issuedAt: row.issuedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    supersededBy: row.supersededBy,
    issueChannel: row.issueChannel,
  };
}

/**
 * Postgres/Drizzle `AccessLinkStore` over `access_link`, shared by `bff-api`
 * (issue, reissue, session exchange, every capability's `findById`) and
 * `bff-worker` (journey-poll's `listActive`) through the same `DATABASE_URL`,
 * and safe across several api instances.
 *
 * SECURITY: the store only ever receives the SHA-256 hex digest of a token
 * (`token_hash`, UNIQUE, the lookup index): it never sees, stores, logs or
 * throws a raw token, and no error message carries a hash either. A duplicate
 * hash is rejected by the unique index (the existing link is never replaced).
 *
 * - Expiry is NOT judged here (use cases compare `expiresAt` to their clock):
 *   rows come back unfiltered, like the in-memory store.
 * - `revoke` is first-wins (`WHERE revoked_at IS NULL`): a revoked link is never
 *   re-revoked or re-pointed.
 * - `supersedeOlderActive` runs in ONE transaction under a per-reservation
 *   advisory lock: it keeps the newest active link (`seq`) and revokes every
 *   older active one in a single UPDATE ... RETURNING, so racing reissues
 *   converge to exactly one active link and each revoked link is returned to
 *   exactly one caller.
 * - Ids that are not uuids behave like unknown ids (null / no-op) instead of a
 *   Postgres cast error, as in-memory.
 */
export function createPostgresAccessLinkStore(db: Db, now: () => Date = () => new Date()): AccessLinkStore {
  return {
    async create(input: CreateAccessLinkInput): Promise<AccessLinkRecord> {
      const [row] = await db
        .insert(accessLink)
        .values({
          tokenHash: input.tokenHash,
          reservationRef: input.reservationRef,
          passengerScope: input.passengerScope,
          issuedAt: now(),
          expiresAt: new Date(input.expiresAt),
          issueChannel: input.issueChannel,
        })
        .returning();
      if (!row) throw new Error("access_link insert returned no row");
      return toRecord(row);
    },

    async findByTokenHash(tokenHash: string): Promise<AccessLinkRecord | null> {
      const [row] = await db.select().from(accessLink).where(eq(accessLink.tokenHash, tokenHash)).limit(1);
      return row ? toRecord(row) : null;
    },

    async findById(id: string): Promise<AccessLinkRecord | null> {
      if (!UUID.test(id)) return null;
      const [row] = await db.select().from(accessLink).where(eq(accessLink.id, id)).limit(1);
      return row ? toRecord(row) : null;
    },

    async findActiveByReservation(reservationRef: string): Promise<AccessLinkRecord[]> {
      const rows = await db
        .select()
        .from(accessLink)
        .where(and(eq(accessLink.reservationRef, reservationRef), isNull(accessLink.revokedAt)))
        .orderBy(asc(accessLink.seq));
      return rows.map(toRecord);
    },

    async revoke(id: string, supersededBy: string): Promise<void> {
      if (!UUID.test(id)) return;
      await db
        .update(accessLink)
        .set({ revokedAt: now(), supersededBy })
        .where(and(eq(accessLink.id, id), isNull(accessLink.revokedAt)));
    },

    async listActive(): Promise<AccessLinkRecord[]> {
      const rows = await db.select().from(accessLink).where(isNull(accessLink.revokedAt)).orderBy(asc(accessLink.seq));
      return rows.map(toRecord);
    },

    async supersedeOlderActive(reservationRef: string): Promise<AccessLinkRecord[]> {
      return db.transaction(async (tx) => {
        // Serialise reissues of ONE reservation (released at commit): each statement below then
        // sees every link the previous reissue committed.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${reservationRef}, 0))`);
        const [newest] = await tx
          .select({ id: accessLink.id, seq: accessLink.seq })
          .from(accessLink)
          .where(and(eq(accessLink.reservationRef, reservationRef), isNull(accessLink.revokedAt)))
          .orderBy(desc(accessLink.seq))
          .limit(1);
        if (!newest) return [];
        // Strictly OLDER than the newest: a link committed after the SELECT is the next reissue's to keep.
        const rows = await tx
          .update(accessLink)
          .set({ revokedAt: now(), supersededBy: newest.id })
          .where(
            and(
              eq(accessLink.reservationRef, reservationRef),
              isNull(accessLink.revokedAt),
              lt(accessLink.seq, newest.seq),
            ),
          )
          .returning();
        return rows.sort((a, b) => a.seq - b.seq).map(toRecord);
      });
    },
  };
}
