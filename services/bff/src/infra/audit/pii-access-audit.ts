import { randomUUID } from "node:crypto";

/**
 * `pii_access_audit` write path (design Data Model / Security section): every
 * unwrap, handoff, or purge of pre check-in ID/photo data must be audited.
 * Modeled as a small port (same in-memory-port convention as the other
 * stores in this codebase) so the pre check-in `HandoffJob`/`PurgeJob` (task
 * 8.5) are unit testable deterministically; a Drizzle-backed adapter over the
 * `pii_access_audit` table (task 3.3's schema) lands once a consumer needs it
 * against a live database.
 */
export interface PiiAccessAuditEntry {
  actor: string;
  action: string;
  subjectType: string;
  subjectId: string;
}

export interface PiiAccessAuditRecord extends PiiAccessAuditEntry {
  id: string;
  at: string;
}

export interface PiiAccessAuditPort {
  record(entry: PiiAccessAuditEntry): Promise<PiiAccessAuditRecord>;
}

export interface InMemoryPiiAccessAudit extends PiiAccessAuditPort {
  /** Test/dev-only introspection: every entry recorded by this instance, in call order. */
  readonly entries: PiiAccessAuditRecord[];
}

export function createInMemoryPiiAccessAudit(): InMemoryPiiAccessAudit {
  const entries: PiiAccessAuditRecord[] = [];

  return {
    entries,

    async record(entry: PiiAccessAuditEntry): Promise<PiiAccessAuditRecord> {
      const recorded: PiiAccessAuditRecord = {
        ...entry,
        id: randomUUID(),
        at: new Date().toISOString(),
      };
      entries.push(recorded);
      return recorded;
    },
  };
}
