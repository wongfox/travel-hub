import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbHandle } from "../../infra/db/client.js";
import { runMigrations } from "../../infra/db/migrate.js";
import { TEST_DATABASE_URL } from "../../infra/db/test-database.js";
import { describeSessionStoreContract } from "../../modules/trip-access/session-store.conformance.js";
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

describeSessionStoreContract(
  "postgres",
  {
    async make(now) {
      if (!handle) throw new Error("no test database");
      await handle.pool.query("TRUNCATE session, access_link CASCADE");
      const links = createPostgresAccessLinkStore(handle.db, now);
      return {
        store: createPostgresSessionStore(handle.db, now),
        newLinkId: async () =>
          (
            await links.create({
              tokenHash: `link-hash-${randomUUID()}`,
              reservationRef: "RES-1001",
              passengerScope: [],
              expiresAt: "2099-01-01T00:00:00.000Z",
              issueChannel: "email",
            })
          ).id,
      };
    },
  },
  { skip: !TEST_DATABASE_URL },
);

describe.skipIf(!TEST_DATABASE_URL)("session (postgres-only invariants)", () => {
  beforeAll(async () => {
    await handle!.pool.query("TRUNCATE session, access_link CASCADE");
  });

  it("rejects, by foreign key, a session for a link that does not exist (a session is always bound to a real link)", async () => {
    const store = createPostgresSessionStore(handle!.db);

    await expect(
      store.create("fk-session-hash", { linkId: "00000000-0000-4000-8000-000000000000", expiresAt: "2099-01-01T00:00:00.000Z", locale: "es" }),
    ).rejects.toThrow();
    expect(await store.findByIdHash("fk-session-hash")).toBeNull();
  });

  it("stores only the given hash: the id_hash column is the primary key and no column holds a raw session id", async () => {
    const link = await createPostgresAccessLinkStore(handle!.db).create({
      tokenHash: "b".repeat(64),
      reservationRef: "RES-2",
      passengerScope: [],
      expiresAt: "2099-01-01T00:00:00.000Z",
      issueChannel: "email",
    });
    await createPostgresSessionStore(handle!.db).create("c".repeat(64), {
      linkId: link.id,
      expiresAt: "2099-01-01T00:00:00.000Z",
      locale: "es",
    });

    const { rows } = await handle!.pool.query("SELECT row_to_json(s)::text AS t FROM session s");
    expect(rows).toHaveLength(1);
    expect(Object.keys(JSON.parse(rows[0].t as string)).sort()).toEqual(
      ["created_at", "expires_at", "id_hash", "last_seen_at", "link_id", "locale", "user_agent_class"].sort(),
    );
  });
});
