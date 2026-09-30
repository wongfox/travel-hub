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
