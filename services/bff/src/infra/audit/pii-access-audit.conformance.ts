import { beforeEach, describe, expect, it } from "vitest";
import type { PiiAccessAuditPort, PiiAccessAuditRecord } from "./pii-access-audit.js";

export interface PiiAccessAuditHarness {
  /** An audit sink over EMPTY state (the Postgres harness truncates first) whose clock reads `now()`, plus a way to read everything back in append order. */
  make(now?: () => Date): Promise<{ audit: PiiAccessAuditPort; readAll(): Promise<PiiAccessAuditRecord[]> }>;
}

const ENTRY = {
  actor: "worker:precheckin-handoff-job",
  action: "unwrap",
  subjectType: "precheckin_submission",
  subjectId: "sub-1",
};

/**
 * Shared conformance suite for every `PiiAccessAuditPort` implementation
 * (in-memory and Postgres): append-only audit entries, stable append order
 * even inside one clock tick, and the exact stored shape.
 */
export function describePiiAccessAuditContract(
  name: string,
  harness: PiiAccessAuditHarness,
  options: { skip?: boolean } = {},
): void {
  describe.skipIf(options.skip === true)(`PiiAccessAudit contract: ${name}`, () => {
    let audit: PiiAccessAuditPort;
    let readAll: () => Promise<PiiAccessAuditRecord[]>;
    beforeEach(async () => {
      ({ audit, readAll } = await harness.make(() => new Date("2026-10-01T12:00:00.000Z")));
    });

    it("records an entry with a generated id and the clock's ISO timestamp, and returns exactly the stored shape", async () => {
      const recorded = await audit.record(ENTRY);

      expect(recorded).toEqual({ ...ENTRY, id: expect.stringMatching(/^[0-9a-f-]{36}$/i), at: "2026-10-01T12:00:00.000Z" });
      expect(await readAll()).toEqual([recorded]);
    });

    it("appends every entry in call order, never overwriting an earlier one, even when the clock does not advance", async () => {
      await audit.record({ ...ENTRY, action: "unwrap" });
      await audit.record({ ...ENTRY, action: "handoff" });
      await audit.record({ ...ENTRY, actor: "b", action: "purge", subjectId: "sub-2" });

      expect((await readAll()).map((entry) => entry.action)).toEqual(["unwrap", "handoff", "purge"]);
    });

    it("gives each entry its own id", async () => {
      const a = await audit.record(ENTRY);
      const b = await audit.record(ENTRY);

      expect(a.id).not.toBe(b.id);
      expect(await readAll()).toHaveLength(2);
    });

    it("persists every entry of a concurrent burst", async () => {
      const recorded = await Promise.all(
        Array.from({ length: 20 }, (_, n) => audit.record({ ...ENTRY, subjectId: `sub-${n}` })),
      );

      const stored = await readAll();
      expect(stored).toHaveLength(20);
      expect(stored.map((entry) => entry.id).sort()).toEqual(recorded.map((entry) => entry.id).sort());
    });
  });
}
