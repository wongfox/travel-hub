import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbHandle } from "../../infra/db/client.js";
import { runMigrations } from "../../infra/db/migrate.js";
import { TEST_DATABASE_URL } from "../../infra/db/test-database.js";
import { describePiiAccessAuditContract } from "../../infra/audit/pii-access-audit.conformance.js";
import { createPostgresPiiAccessAudit } from "./postgres.js";

let handle: DbHandle | undefined;

beforeAll(async () => {
  if (!TEST_DATABASE_URL) return;
  handle = createDb(TEST_DATABASE_URL);
  await runMigrations(handle.db);
});
afterAll(async () => {
  await handle?.close();
});

describePiiAccessAuditContract(
  "postgres",
  {
    async make(now) {
      if (!handle) throw new Error("no test database");
      const { db, pool } = handle;
      await pool.query("TRUNCATE pii_access_audit");
      const audit = createPostgresPiiAccessAudit(db, now);
      const readAll = async () => {
        const { rows } = await pool.query(
          "SELECT id, actor, action, subject_type, subject_id, at FROM pii_access_audit ORDER BY seq",
        );
        return rows.map((row) => ({
          id: row.id as string,
          actor: row.actor as string,
          action: row.action as string,
          subjectType: row.subject_type as string,
          subjectId: row.subject_id as string,
          at: (row.at as Date).toISOString(),
        }));
      };
      return { audit, readAll };
    },
  },
  { skip: !TEST_DATABASE_URL },
);

// The adapter has no update/delete method; this proves POSTGRES itself refuses them too.
describe.skipIf(!TEST_DATABASE_URL)("pii_access_audit is append-only at the database", () => {
  it("rejects UPDATE and DELETE of an audit row", async () => {
    if (!handle) throw new Error("no test database");
    await handle.pool.query("TRUNCATE pii_access_audit");
    const audit = createPostgresPiiAccessAudit(handle.db);
    const entry = await audit.record({ actor: "a", action: "purge", subjectType: "push_subscription", subjectId: "s-1" });

    await expect(handle.pool.query("UPDATE pii_access_audit SET action = 'x' WHERE id = $1", [entry.id])).rejects.toThrow(/append-only/);
    await expect(handle.pool.query("DELETE FROM pii_access_audit WHERE id = $1", [entry.id])).rejects.toThrow(/append-only/);
    const { rows } = await handle.pool.query("SELECT action FROM pii_access_audit WHERE id = $1", [entry.id]);
    expect(rows).toEqual([{ action: "purge" }]);
  });
});
