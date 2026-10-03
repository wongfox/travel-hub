import { randomUUID } from "node:crypto";

/**
 * `pii_access_audit` write path (design Data Model / Security section): every
 * unwrap, handoff, or purge of pre check-in ID/photo data must be audited.
 * Modeled as a small port (same in-memory-port convention as the other
 * stores in this codebase) so the pre check-in `HandoffJob`/`PurgeJob` (task
 * 8.5) are unit testable deterministically. The in-memory implementation is the
 * dev/test default; `adapters/pii-access-audit/postgres.ts` is the shared
 * Postgres one (same conformance suite) for api + worker.
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

export function createInMemoryPiiAccessAudit(now: () => Date = () => new Date()): InMemoryPiiAccessAudit {
  const entries: PiiAccessAuditRecord[] = [];

  return {
    entries,

    async record(entry: PiiAccessAuditEntry): Promise<PiiAccessAuditRecord> {
      const recorded: PiiAccessAuditRecord = {
        ...entry,
        id: randomUUID(),
        at: now().toISOString(),
      };
      entries.push(recorded);
      return recorded;
    },
  };
}
