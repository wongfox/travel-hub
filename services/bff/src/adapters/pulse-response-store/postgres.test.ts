import { afterAll, beforeAll } from "vitest";
import { createDb, type DbHandle } from "../../infra/db/client.js";
import { runMigrations } from "../../infra/db/migrate.js";
import { TEST_DATABASE_URL } from "../../infra/db/test-database.js";
import { describePulseResponseStoreContract } from "../../modules/pulse/pulse-response-store.conformance.js";
import { createPostgresPulseResponseStore } from "./postgres.js";

let handle: DbHandle | undefined;

beforeAll(async () => {
  if (!TEST_DATABASE_URL) return;
  handle = createDb(TEST_DATABASE_URL);
  await runMigrations(handle.db);
});
afterAll(async () => {
  await handle?.close();
});

describePulseResponseStoreContract(
  "postgres",
  {
    async make(now, retention) {
      if (!handle) throw new Error("no test database");
      await handle.pool.query("TRUNCATE pulse_response");
      return createPostgresPulseResponseStore(handle.db, now, retention);
    },
  },
  { skip: !TEST_DATABASE_URL },
);
