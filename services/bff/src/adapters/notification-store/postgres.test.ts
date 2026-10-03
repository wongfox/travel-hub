import { afterAll, beforeAll } from "vitest";
import { createDb, type DbHandle } from "../../infra/db/client.js";
import { runMigrations } from "../../infra/db/migrate.js";
import { TEST_DATABASE_URL } from "../../infra/db/test-database.js";
import { describeNotificationStoreContract } from "../../modules/notifications/notification-store.conformance.js";
import { createPostgresNotificationStore } from "./postgres.js";

let handle: DbHandle | undefined;

beforeAll(async () => {
  if (!TEST_DATABASE_URL) return;
  handle = createDb(TEST_DATABASE_URL);
  await runMigrations(handle.db);
});
afterAll(async () => {
  await handle?.close();
});

describeNotificationStoreContract(
  "postgres",
  {
    async make(now) {
      if (!handle) throw new Error("no test database");
      await handle.pool.query("TRUNCATE notification");
      return createPostgresNotificationStore(handle.db, now);
    },
  },
  { skip: !TEST_DATABASE_URL },
);
