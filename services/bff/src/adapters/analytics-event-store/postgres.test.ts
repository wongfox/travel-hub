import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbHandle } from "../../infra/db/client.js";
import { runMigrations } from "../../infra/db/migrate.js";
import { TEST_DATABASE_URL } from "../../infra/db/test-database.js";
import { describeAnalyticsEventStoreContract } from "../../modules/analytics/analytics-event-store.conformance.js";
import { createPostgresAnalyticsEventStore } from "./postgres.js";

let handle: DbHandle | undefined;

beforeAll(async () => {
  if (!TEST_DATABASE_URL) return;
  handle = createDb(TEST_DATABASE_URL);
  await runMigrations(handle.db);
});
afterAll(async () => {
  await handle?.close();
});

describeAnalyticsEventStoreContract(
  "postgres",
  {
    async make(now) {
      if (!handle) throw new Error("no test database");
      await handle.pool.query("TRUNCATE analytics_event");
      return createPostgresAnalyticsEventStore(handle.db, now);
    },
  },
  { skip: !TEST_DATABASE_URL },
);

// The conformance suite's invalid-row case is rejected before any SQL runs; this one is rejected BY POSTGRES
// at the third row (a NUL byte is invalid in `text`), so it proves the batch is a single atomic statement.
describe.skipIf(!TEST_DATABASE_URL)("postgres createMany atomicity at the database", () => {
  it("persists none of the batch when Postgres rejects a later row", async () => {
    if (!handle) throw new Error("no test database");
    await handle.pool.query("TRUNCATE analytics_event");
    const store = createPostgresAnalyticsEventStore(handle.db);
    const base = { name: "screen_view" as const, occurredAt: "2026-10-01T00:00:00.000Z" };

    await expect(
      store.createMany([
        { ...base, tripHash: "a".repeat(64) },
        { ...base, tripHash: "a".repeat(64) },
        { ...base, tripHash: "bad\u0000hash" },
      ]),
    ).rejects.toThrow();

    expect(await store.list()).toEqual([]);
  });
});
