import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

export type Db = NodePgDatabase<typeof schema>;

export interface DbHandle {
  db: Db;
  pool: pg.Pool;
  close(): Promise<void>;
}

/**
 * Drizzle client over a `pg` pool. Construction never dials the database
 * (pg connects lazily on the first query), so it is safe at composition time.
 * `bff-api` and `bff-worker` each build their own handle from the same
 * `DATABASE_URL`; the pool is theirs to close on shutdown.
 */
export function createDb(connectionString: string): DbHandle {
  const pool = new pg.Pool({ connectionString });
  const db = drizzle(pool, { schema });
  return { db, pool, close: () => pool.end() };
}
