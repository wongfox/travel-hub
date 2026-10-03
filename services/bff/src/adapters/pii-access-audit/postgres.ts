import type { Db } from "../../infra/db/client.js";
import { piiAccessAudit } from "../../infra/db/schema.js";
import type { PiiAccessAuditEntry, PiiAccessAuditPort, PiiAccessAuditRecord } from "../../infra/audit/pii-access-audit.js";

/**
 * Postgres/Drizzle `PiiAccessAuditPort` over `pii_access_audit`, shared by
 * `bff-api` (consent-withdrawal cascade) and `bff-worker` (handoff/purge
 * jobs) through the same `DATABASE_URL`. The only write is an INSERT; the
 * table additionally rejects UPDATE/DELETE with a trigger (migration 0004).
 */
export function createPostgresPiiAccessAudit(db: Db, now: () => Date = () => new Date()): PiiAccessAuditPort {
  return {
    async record(entry: PiiAccessAuditEntry): Promise<PiiAccessAuditRecord> {
      const [row] = await db
        .insert(piiAccessAudit)
        .values({
          actor: entry.actor,
          action: entry.action,
          subjectType: entry.subjectType,
          subjectId: entry.subjectId,
          at: now(),
        })
        .returning();
      if (!row) throw new Error("pii_access_audit insert returned no row");
      return {
        id: row.id,
        actor: row.actor,
        action: row.action,
        subjectType: row.subjectType,
        subjectId: row.subjectId,
        at: row.at.toISOString(),
      };
    },
  };
}
