import { afterAll, beforeAll } from "vitest";
import { createDb, type DbHandle } from "../../infra/db/client.js";
import { runMigrations } from "../../infra/db/migrate.js";
import { TEST_DATABASE_URL } from "../../infra/db/test-database.js";
import { describeConsentStoreContract } from "../../modules/privacy/consent-store.conformance.js";
import { createPostgresConsentStore } from "./postgres.js";

let handle: DbHandle | undefined;

beforeAll(async () => {
  if (!TEST_DATABASE_URL) return;
  handle = createDb(TEST_DATABASE_URL);
  await runMigrations(handle.db);
});
afterAll(async () => {
  await handle?.close();
});

describeConsentStoreContract(
  "postgres",
  {
    async make() {
      if (!handle) throw new Error("no test database");
      await handle.pool.query("TRUNCATE consent_record");
      return createPostgresConsentStore(handle.db);
    },
  },
  { skip: !TEST_DATABASE_URL },
);
