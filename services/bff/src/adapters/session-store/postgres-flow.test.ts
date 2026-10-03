import { afterAll, beforeAll } from "vitest";
import { createDb, type DbHandle } from "../../infra/db/client.js";
import { runMigrations } from "../../infra/db/migrate.js";
import { TEST_DATABASE_URL } from "../../infra/db/test-database.js";
import { describeTripAccessFlow } from "../../modules/trip-access/trip-access-flow.conformance.js";
import { createPostgresAccessLinkStore } from "../access-link-store/postgres.js";
import { createPostgresSessionStore } from "./postgres.js";

let handle: DbHandle | undefined;

beforeAll(async () => {
  if (!TEST_DATABASE_URL) return;
  handle = createDb(TEST_DATABASE_URL);
  await runMigrations(handle.db);
});
afterAll(async () => {
  await handle?.close();
});

// The real trip-access use cases (issue, exchange, resolve, reissue) over the Postgres stores:
// the threat-matrix assertions must hold on the shared stores exactly as in-memory.
describeTripAccessFlow(
  "postgres",
  {
    async make(now) {
      if (!handle) throw new Error("no test database");
      const pool = handle.pool;
      await pool.query("TRUNCATE session, access_link CASCADE");
      return {
        accessLinkStore: createPostgresAccessLinkStore(handle.db, now),
        sessionStore: createPostgresSessionStore(handle.db, now),
        dumpStoredText: async () => {
          const links = await pool.query("SELECT row_to_json(a)::text AS t FROM access_link a");
          const sessions = await pool.query("SELECT row_to_json(s)::text AS t FROM session s");
          return [...links.rows, ...sessions.rows].map((row) => row.t as string).join("\n");
        },
      };
    },
  },
  { skip: !TEST_DATABASE_URL },
);
