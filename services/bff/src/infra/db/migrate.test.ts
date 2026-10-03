import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "./client.js";
import { runMigrations } from "./migrate.js";
import { TEST_DATABASE_URL } from "./test-database.js";

describe.skipIf(!TEST_DATABASE_URL)("runMigrations (real Postgres)", () => {
  const handle = createDb(TEST_DATABASE_URL ?? "");
  afterAll(() => handle.close());

  it("applies every migration and is idempotent on a second run", async () => {
    await runMigrations(handle.db);
    await runMigrations(handle.db);

    const { rows } = await handle.pool.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public' order by tablename",
    );
    const names = rows.map((r) => r.tablename);
    expect(names).toEqual(expect.arrayContaining(["access_link", "wifi_order", "wifi_order_event"]));
  });
});
