import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbHandle } from "../../infra/db/client.js";
import { runMigrations } from "../../infra/db/migrate.js";
import { TEST_DATABASE_URL } from "../../infra/db/test-database.js";
import { describeAccessLinkStoreContract } from "../../modules/trip-access/access-link-store.conformance.js";
import { createPostgresAccessLinkStore } from "./postgres.js";

let handle: DbHandle | undefined;

beforeAll(async () => {
  if (!TEST_DATABASE_URL) return;
  handle = createDb(TEST_DATABASE_URL);
  await runMigrations(handle.db);
});
afterAll(async () => {
  await handle?.close();
});

describeAccessLinkStoreContract(
  "postgres",
  {
    async make(now) {
      if (!handle) throw new Error("no test database");
      await handle.pool.query("TRUNCATE session, access_link CASCADE");
      return createPostgresAccessLinkStore(handle.db, now);
    },
  },
  { skip: !TEST_DATABASE_URL },
);

describe.skipIf(!TEST_DATABASE_URL)("access_link (postgres-only invariants)", () => {
  const insertRaw = (supersededBy: string | null, revokedAt: string | null, id = "11111111-1111-4111-8111-111111111111") =>
    handle!.pool.query(
      `INSERT INTO access_link (id, token_hash, reservation_ref, expires_at, issue_channel, superseded_by, revoked_at)
       VALUES ($1::uuid, 'raw-sql-hash-' || $1::text, 'R', now(), 'email', $2::uuid, $3::timestamptz)`,
      [id, supersededBy, revokedAt],
    );

  beforeAll(async () => {
    await handle!.pool.query("TRUNCATE session, access_link CASCADE");
  });

  it("rejects, by CHECK, a superseded link that is not revoked", async () => {
    await insertRaw(null, null, "22222222-2222-4222-8222-222222222222");
    await expect(insertRaw("22222222-2222-4222-8222-222222222222", null)).rejects.toThrow(
      /access_link_superseded_implies_revoked/,
    );
  });

  it("rejects, by CHECK, a link superseded by itself", async () => {
    const id = "33333333-3333-4333-8333-333333333333";
    await expect(insertRaw(id, new Date().toISOString(), id)).rejects.toThrow(/access_link_superseded_implies_revoked/);
  });

  it("never stores anything but the given hash: the row text contains no raw-token marker", async () => {
    const store = createPostgresAccessLinkStore(handle!.db);
    await store.create({
      tokenHash: "a".repeat(64),
      reservationRef: "RES-1",
      passengerScope: [],
      expiresAt: "2099-01-01T00:00:00.000Z",
      issueChannel: "email",
    });
    const { rows } = await handle!.pool.query("SELECT row_to_json(a)::text AS t FROM access_link a WHERE reservation_ref = 'RES-1'");
    expect(rows).toHaveLength(1);
    expect(rows[0].t).toContain("a".repeat(64));
    expect(Object.keys(JSON.parse(rows[0].t as string)).sort()).toEqual(
      [
        "expires_at",
        "id",
        "issue_channel",
        "issued_at",
        "locale_hint",
        "passenger_scope",
        "reservation_ref",
        "revoked_at",
        "seq",
        "superseded_by",
        "token_hash",
      ].sort(),
    );
  });
});
