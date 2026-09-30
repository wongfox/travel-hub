import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/infra/db/schema.ts",
  out: "./src/infra/db/migrations",
  // Only used by drizzle-kit's `migrate`/`push` commands against a live
  // database, never by `generate` (static schema diff, no connection
  // required). A real connection string is supplied via DATABASE_URL at
  // runtime/CI, never committed here.
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://placeholder:placeholder@localhost:5432/placeholder",
  },
});
