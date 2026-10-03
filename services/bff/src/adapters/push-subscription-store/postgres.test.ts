import { afterAll, beforeAll } from "vitest";
import { createDb, type DbHandle } from "../../infra/db/client.js";
import { runMigrations } from "../../infra/db/migrate.js";
import { TEST_DATABASE_URL } from "../../infra/db/test-database.js";
import { describePushSubscriptionStoreContract } from "../../modules/notifications/push-subscription-store.conformance.js";
import { createPostgresPushSubscriptionStore } from "./postgres.js";

let handle: DbHandle | undefined;

beforeAll(async () => {
  if (!TEST_DATABASE_URL) return;
  handle = createDb(TEST_DATABASE_URL);
  await runMigrations(handle.db);
});
afterAll(async () => {
  await handle?.close();
});

describePushSubscriptionStoreContract(
  "postgres",
  {
    async make(now) {
      if (!handle) throw new Error("no test database");
      await handle.pool.query("TRUNCATE push_subscription");
      return createPostgresPushSubscriptionStore(handle.db, now);
    },
  },
  { skip: !TEST_DATABASE_URL },
);
