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
