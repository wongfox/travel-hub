import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbHandle } from "../../infra/db/client.js";
import { runMigrations } from "../../infra/db/migrate.js";
import { TEST_DATABASE_URL } from "../../infra/db/test-database.js";
import { describeStaffAlertStoreContract } from "../../modules/pulse/staff-alert-store.conformance.js";
import { createPostgresStaffAlertStore } from "./postgres.js";

let handle: DbHandle | undefined;

beforeAll(async () => {
  if (!TEST_DATABASE_URL) return;
  handle = createDb(TEST_DATABASE_URL);
  await runMigrations(handle.db);
});
afterAll(async () => {
  await handle?.close();
});

describeStaffAlertStoreContract(
  "postgres",
  {
    async make(now, retention) {
      if (!handle) throw new Error("no test database");
      await handle.pool.query("TRUNCATE staff_alert");
      return createPostgresStaffAlertStore(handle.db, now, retention);
    },
  },
  { skip: !TEST_DATABASE_URL },
);

describe.skipIf(!TEST_DATABASE_URL)("staff_alert minimal-PII guard in Postgres", () => {
  const payload = {
    alertId: "alert-1",
    reservationRef: "RES-1001",
    passengerOrdinal: 1,
    leg: { origin: "A", destination: "B", departureLocal: "2026-11-02T08:10:00-05:00" },
    returnLegDepartureLocal: null,
    serviceTier: "PRIME",
    score: 1,
    scaleMax: 5,
    answeredAt: "2026-11-02T08:15:00.000Z",
    passengerLocale: "es",
  };

  async function insertRaw(body: Record<string, unknown>): Promise<void> {
    if (!handle) throw new Error("no test database");
    await handle.pool.query(
      "INSERT INTO staff_alert (pulse_response_id, payload, purge_after) VALUES (gen_random_uuid(), $1::jsonb, now())",
      [JSON.stringify(body)],
    );
  }

  it("rejects, in the database itself, a payload with a top-level key outside the strict shape (no free-text PII even via raw SQL)", async () => {
    if (!handle) throw new Error("no test database");
    await handle.pool.query("TRUNCATE staff_alert");

    await expect(insertRaw({ ...payload, passengerName: "Ada" })).rejects.toThrow(/staff_alert_payload_minimal_keys/);
    await expect(insertRaw(payload)).resolves.toBeUndefined();
    await handle.pool.query("TRUNCATE staff_alert");
  });
});
