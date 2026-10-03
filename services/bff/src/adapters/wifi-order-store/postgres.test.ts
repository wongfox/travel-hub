import { afterAll, beforeAll } from "vitest";
import { createDb, type DbHandle } from "../../infra/db/client.js";
import { runMigrations } from "../../infra/db/migrate.js";
import { TEST_DATABASE_URL } from "../../infra/db/test-database.js";
import { describeWifiOrderStoreContract } from "../../modules/wifi-checkout/wifi-order-store.conformance.js";
import { createPostgresWifiOrderStore } from "./postgres.js";

let handle: DbHandle | undefined;

beforeAll(async () => {
  if (!TEST_DATABASE_URL) return;
  handle = createDb(TEST_DATABASE_URL);
  await runMigrations(handle.db);
});
afterAll(async () => {
  await handle?.close();
});

describeWifiOrderStoreContract(
  "postgres",
  {
    async make(now) {
      if (!handle) throw new Error("no test database");
      await handle.pool.query("TRUNCATE wifi_order_event, wifi_order");
      return createPostgresWifiOrderStore(handle.db, now);
    },
  },
  { skip: !TEST_DATABASE_URL },
);
