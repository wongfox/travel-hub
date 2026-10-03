import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbHandle } from "../../infra/db/client.js";
import { runMigrations } from "../../infra/db/migrate.js";
import { TEST_DATABASE_URL } from "../../infra/db/test-database.js";
import { describePrecheckinSubmissionStoreContract } from "../../modules/precheckin/submission-store.conformance.js";
import { createPostgresPrecheckinSubmissionStore } from "./postgres.js";

let handle: DbHandle | undefined;

beforeAll(async () => {
  if (!TEST_DATABASE_URL) return;
  handle = createDb(TEST_DATABASE_URL);
  await runMigrations(handle.db);
});
afterAll(async () => {
  await handle?.close();
});

describePrecheckinSubmissionStoreContract(
  "postgres",
  {
    async make(now) {
      if (!handle) throw new Error("no test database");
      await handle.pool.query("TRUNCATE precheckin_submission");
      return createPostgresPrecheckinSubmissionStore(handle.db, now);
    },
  },
  { skip: !TEST_DATABASE_URL },
);

describe.skipIf(!TEST_DATABASE_URL)("precheckin_submission (postgres-only invariants)", () => {
  const insertRaw = (status: string, wrapped: string, idBackKey: string | null = null, idBackWrapped: string | null = null) =>
    handle!.pool.query(
      `INSERT INTO precheckin_submission (reservation_ref, passenger_ref, doc_type, consent_record_id, status,
         photo_object_key, photo_wrapped_data_key, photo_iv, photo_auth_tag,
         id_front_object_key, id_front_wrapped_data_key, id_front_iv, id_front_auth_tag,
         id_back_object_key, id_back_wrapped_data_key, id_back_iv, id_back_auth_tag,
         submitted_at, purge_after)
       VALUES ('R', 'P', 'DNI', 'c', $1, 'k1', $2::bytea, '\\x'::bytea, '\\x'::bytea, 'k2', '\\x'::bytea, '\\x'::bytea, '\\x'::bytea,
         $3, $4::bytea, $4::bytea, $4::bytea, now(), now())`,
      [status, wrapped, idBackKey, idBackWrapped],
    );

  beforeAll(async () => {
    await handle!.pool.query("TRUNCATE precheckin_submission");
  });

  it("rejects, by CHECK, a purged row that still carries key material (crypto-shredding is a database invariant)", async () => {
    await expect(insertRaw("purged", "\\x0102")).rejects.toThrow(/precheckin_submission_purged_shredded/);
    await handle!.pool.query("TRUNCATE precheckin_submission");
    await expect(insertRaw("purged", "\\x")).resolves.toBeDefined();
  });

  it("rejects, by CHECK, a half-filled id_back envelope", async () => {
    await handle!.pool.query("TRUNCATE precheckin_submission");
    await expect(insertRaw("received", "\\x01", "back-key", null)).rejects.toThrow(
      /precheckin_submission_id_back_all_or_none/,
    );
  });
});
