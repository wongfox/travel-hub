import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "migrations");

function readFirstMigrationSql(): string {
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
  if (files.length === 0) {
    throw new Error(`No .sql migration found in ${migrationsDir}`);
  }
  const first = files.sort()[0];
  if (!first) {
    throw new Error(`No .sql migration found in ${migrationsDir}`);
  }
  return readFileSync(join(migrationsDir, first), "utf-8");
}

describe("first migration (generated from schema.ts via drizzle-kit generate)", () => {
  it("creates all five foundational tables with their primary/foreign keys", () => {
    const sql = readFirstMigrationSql();

    expect(sql).toMatch(/CREATE TABLE "access_link"/);
    expect(sql).toMatch(/CREATE TABLE "session"/);
    expect(sql).toMatch(/CREATE TABLE "consent_record"/);
    expect(sql).toMatch(/CREATE TABLE "feature_flag"/);
    expect(sql).toMatch(/CREATE TABLE "pii_access_audit"/);
  });

  it("restricts consent_record.purpose to an enum with exactly the four design-listed purposes", () => {
    const sql = readFirstMigrationSql();

    expect(sql).toMatch(
      /CREATE TYPE "public"\."consent_purpose" AS ENUM\('analytics', 'push', 'pulse', 'precheckin_biometric'\)/,
    );
  });

  it("enforces access_link.token_hash as UNIQUE, matching the design's hashed-token lookup requirement", () => {
    const sql = readFirstMigrationSql();

    expect(sql).toMatch(/CONSTRAINT "access_link_token_hash_unique" UNIQUE\("token_hash"\)/);
  });

  it("declares foreign keys from session and consent_record back to access_link", () => {
    const sql = readFirstMigrationSql();

    expect(sql).toMatch(
      /ALTER TABLE "session" ADD CONSTRAINT .* FOREIGN KEY \("link_id"\) REFERENCES "public"\."access_link"\("id"\)/,
    );
    expect(sql).toMatch(
      /ALTER TABLE "consent_record" ADD CONSTRAINT .* FOREIGN KEY \("link_id"\) REFERENCES "public"\."access_link"\("id"\)/,
    );
  });
});

describe("wifi_order migration", () => {
  const sql = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(migrationsDir, f), "utf-8"))
    .join("\n");

  it("creates wifi_order with a unique idempotency_key and a status index", () => {
    expect(sql).toMatch(/CREATE TABLE "wifi_order"/);
    expect(sql).toMatch(/CONSTRAINT "wifi_order_idempotency_key_unique" UNIQUE\("idempotency_key"\)/);
    expect(sql).toMatch(/CREATE INDEX "wifi_order_status_idx" ON "wifi_order"/);
  });

  it("creates wifi_order_event referencing wifi_order", () => {
    expect(sql).toMatch(/CREATE TABLE "wifi_order_event"/);
    expect(sql).toMatch(/FOREIGN KEY \("order_id"\) REFERENCES "public"\."wifi_order"\("id"\)/);
  });
});

describe("consent_record shared-store migration", () => {
  const all = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(migrationsDir, f), "utf-8"))
    .join("\n");

  it("drops the link_id foreign key (access links are still process-local) and adds a monotonic seq", () => {
    expect(all).toMatch(/ALTER TABLE "consent_record" DROP CONSTRAINT "consent_record_link_id_access_link_id_fk"/);
    expect(all).toMatch(/ALTER TABLE "consent_record" ADD COLUMN "seq" bigint NOT NULL GENERATED ALWAYS AS IDENTITY/);
  });

  it("indexes latest-per-purpose lookups by (reservation_ref, purpose, seq)", () => {
    expect(all).toMatch(/CREATE INDEX "consent_record_latest_idx" ON "consent_record" USING btree \("reservation_ref","purpose","seq"\)/);
  });
});

describe("analytics_event migration", () => {
  const all = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(migrationsDir, f), "utf-8"))
    .join("\n");
  const table = all.match(/CREATE TABLE "analytics_event" \(([\s\S]*?)\n\);/)?.[1] ?? "";

  it("stores only the pseudonymous trip_hash, never a reservation or passenger reference", () => {
    expect(table).toMatch(/"trip_hash" text NOT NULL/);
    expect(table).not.toMatch(/reservation|passenger/i);
  });

  it("indexes the pending scan and the delete-by-trip_hash cascade", () => {
    expect(all).toMatch(/CREATE INDEX "analytics_event_pending_idx" ON "analytics_event" USING btree \("seq"\) WHERE "analytics_event"\."forwarded_at" is null/);
    expect(all).toMatch(/CREATE INDEX "analytics_event_trip_hash_idx" ON "analytics_event" USING btree \("trip_hash"\)/);
  });
});

describe("pii_access_audit shared-store migration", () => {
  const all = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(migrationsDir, f), "utf-8"))
    .join("\n");

  it("adds a monotonic seq and an index for per-subject lookups", () => {
    expect(all).toMatch(/ALTER TABLE "pii_access_audit" ADD COLUMN "seq" bigint NOT NULL GENERATED ALWAYS AS IDENTITY/);
    expect(all).toMatch(/CREATE INDEX "pii_access_audit_subject_idx" ON "pii_access_audit" USING btree \("subject_type","subject_id","seq"\)/);
  });

  it("makes the table append-only with a trigger that rejects UPDATE and DELETE", () => {
    expect(all).toMatch(/CREATE TRIGGER pii_access_audit_append_only\s+BEFORE UPDATE OR DELETE ON "pii_access_audit"/);
  });
});

describe("push_subscription migration", () => {
  const all = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(migrationsDir, f), "utf-8"))
    .join("\n");
  const table = all.match(/CREATE TABLE "push_subscription" \(([\s\S]*?)\n\);/)?.[1] ?? "";

  it("keeps link_id and consent_record_id as plain uuid references (access links are still in-memory: no FK)", () => {
    expect(table).toMatch(/"link_id" uuid NOT NULL/);
    expect(table).toMatch(/"consent_record_id" uuid NOT NULL/);
    expect(all).not.toMatch(/ALTER TABLE "push_subscription" ADD CONSTRAINT/);
  });

  it("indexes the reservation/link lookups and the expires_at purge scan", () => {
    expect(all).toMatch(/CREATE INDEX "push_subscription_reservation_idx" ON "push_subscription" USING btree \("reservation_ref"\)/);
    expect(all).toMatch(/CREATE INDEX "push_subscription_link_idx" ON "push_subscription" USING btree \("link_id"\)/);
    expect(all).toMatch(/CREATE INDEX "push_subscription_expires_at_idx" ON "push_subscription" USING btree \("expires_at"\)/);
  });
});

describe("notification migration", () => {
  const all = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(migrationsDir, f), "utf-8"))
    .join("\n");

  it("enforces dedupe_key as UNIQUE (the journey-poll dedupe guarantee lives in Postgres)", () => {
    expect(all).toMatch(/CREATE TABLE "notification"/);
    expect(all).toMatch(/CONSTRAINT "notification_dedupe_key_unique" UNIQUE\("dedupe_key"\)/);
  });

  it("restricts channel and status to closed enums", () => {
    expect(all).toMatch(/CREATE TYPE "public"\."notification_channel" AS ENUM\('banner', 'push'\)/);
    expect(all).toMatch(/CREATE TYPE "public"\."notification_status" AS ENUM\('pending', 'sent', 'failed', 'skipped_policy'\)/);
  });
});

describe("pulse_response migration", () => {
  const all = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(migrationsDir, f), "utf-8"))
    .join("\n");

  it("enforces one response per passenger/leg as a UNIQUE constraint (the spec's idempotency lives in Postgres)", () => {
    expect(all).toMatch(/CREATE TABLE "pulse_response"/);
    expect(all).toMatch(
      /CONSTRAINT "pulse_response_passenger_leg_unique" UNIQUE\("reservation_ref","passenger_ref","leg_ref"\)/,
    );
  });

  it("indexes purge_after for the retention purge scan", () => {
    expect(all).toMatch(/CREATE INDEX "pulse_response_purge_after_idx" ON "pulse_response" USING btree \("purge_after"\)/);
  });
});

describe("staff_alert migration", () => {
  const all = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(migrationsDir, f), "utf-8"))
    .join("\n");

  it("enforces exactly one staff_alert per pulse response as UNIQUE(pulse_response_id)", () => {
    expect(all).toMatch(/CREATE TABLE "staff_alert"/);
    expect(all).toMatch(/CONSTRAINT "staff_alert_pulse_response_id_unique" UNIQUE\("pulse_response_id"\)/);
  });

  it("restricts status to a closed enum and indexes purge_after and pending rows", () => {
    expect(all).toMatch(/CREATE TYPE "public"\."staff_alert_status" AS ENUM\('pending', 'sent', 'failed', 'dead'\)/);
    expect(all).toMatch(/CREATE INDEX "staff_alert_purge_after_idx" ON "staff_alert" USING btree \("purge_after"\)/);
    expect(all).toMatch(/CREATE INDEX "staff_alert_pending_idx" ON "staff_alert" USING btree \("seq"\) WHERE "staff_alert"\."status" = 'pending'/);
  });

  it("keeps the payload minimal-PII in the database with a top-level key allow-list CHECK", () => {
    expect(all).toMatch(/CONSTRAINT "staff_alert_payload_minimal_keys" CHECK/);
  });
});

describe("precheckin_submission migration", () => {
  const all = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(migrationsDir, f), "utf-8"))
    .join("\n");

  it("enforces one submission per passenger as a UNIQUE constraint (the already_submitted guarantee lives in Postgres)", () => {
    expect(all).toMatch(/CREATE TABLE "precheckin_submission"/);
    expect(all).toMatch(
      /CONSTRAINT "precheckin_submission_passenger_unique" UNIQUE\("reservation_ref","passenger_ref"\)/,
    );
  });

  it("restricts status and doc_type to closed enums", () => {
    expect(all).toMatch(
      /CREATE TYPE "public"\."precheckin_submission_status" AS ENUM\('received', 'handed_off', 'purged'\)/,
    );
    expect(all).toMatch(/CREATE TYPE "public"\."precheckin_doc_type" AS ENUM\('DNI', 'PASSPORT', 'OTHER'\)/);
  });

  it("indexes the purge and handoff scans with partial indexes", () => {
    expect(all).toMatch(
      /CREATE INDEX "precheckin_submission_purge_after_idx" ON "precheckin_submission" USING btree \("purge_after"\) WHERE "precheckin_submission"\."status" <> 'purged'/,
    );
    expect(all).toMatch(
      /CREATE INDEX "precheckin_submission_pending_handoff_idx" ON "precheckin_submission" USING btree \("seq"\) WHERE "precheckin_submission"\."status" = 'received'/,
    );
  });

  it("stores no document content: only metadata and encryption-envelope references (no image/content/plaintext column)", () => {
    const table = all.slice(all.indexOf('CREATE TABLE "precheckin_submission"'));
    const body = table.slice(0, table.indexOf(");"));
    expect(body).not.toMatch(/"(image|photo|content|plaintext|bytes|data)"/i);
    expect(body).toMatch(/"photo_object_key" text NOT NULL/);
    expect(body).toMatch(/"photo_wrapped_data_key" "?bytea"? NOT NULL/);
  });

  it("makes crypto-shredding a database invariant: a purged row must have zeroed key material", () => {
    expect(all).toMatch(/CONSTRAINT "precheckin_submission_purged_shredded" CHECK/);
    expect(all).toMatch(/CONSTRAINT "precheckin_submission_id_back_all_or_none" CHECK/);
  });
});

describe("access_link / session shared-store migration", () => {
  const all = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(migrationsDir, f), "utf-8"))
    .join("\n");

  it("keeps token_hash UNIQUE and stores no raw-token column on access_link or session", () => {
    expect(all).toMatch(/CONSTRAINT "access_link_token_hash_unique" UNIQUE\("token_hash"\)/);
    const accessLinkTable = all.slice(all.indexOf('CREATE TABLE "access_link"'));
    const body = accessLinkTable.slice(0, accessLinkTable.indexOf(");"));
    expect(body).not.toMatch(/"(token|raw_token|secret)"/i);
    const sessionTable = all.slice(all.indexOf('CREATE TABLE "session"'));
    expect(sessionTable.slice(0, sessionTable.indexOf(");"))).not.toMatch(/"(session_id|raw_id|cookie|token)"/i);
  });

  it("adds an identity seq to access_link (newest-wins order for reissue) and a partial index on active links", () => {
    expect(all).toMatch(/ALTER TABLE "access_link" ADD COLUMN "seq" bigint NOT NULL GENERATED ALWAYS AS IDENTITY/);
    expect(all).toMatch(
      /CREATE INDEX "access_link_active_reservation_idx" ON "access_link" USING btree \("reservation_ref","seq"\) WHERE "access_link"\."revoked_at" IS NULL/,
    );
  });

  it("makes supersession a database invariant: superseded_by implies revoked_at and never points at itself", () => {
    expect(all).toMatch(/CONSTRAINT "access_link_superseded_implies_revoked" CHECK/);
  });

  it("indexes session.link_id", () => {
    expect(all).toMatch(/CREATE INDEX "session_link_id_idx" ON "session" USING btree \("link_id"\)/);
  });
});
