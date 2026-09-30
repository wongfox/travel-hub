import { openDB, type IDBPDatabase } from "idb";

/**
 * Single shared IndexedDB connection (design Data Model "Client-side":
 * IndexedDB `travelhub`) backing both `trip-snapshot-store.ts` (`snapshots`,
 * keyed by link id) and `trip-prefs-store.ts` (`prefs` — currently just the
 * active link id; locale/dismissed-banners are a future addition to the
 * same store, not introduced by this task).
 *
 * `DB_VERSION` must be bumped every time a store is added or changed: native
 * IndexedDB only invokes `upgrade` when the requested version is greater
 * than the version already stored on that device, so a device that already
 * opened this database under a prior `DB_VERSION` (e.g. one that only ever
 * shipped `snapshots`) would otherwise silently keep missing any store
 * added since, with no error surfaced anywhere it's read.
 */
export const DB_NAME = "travelhub";
export const DB_VERSION = 2;
export const SNAPSHOTS_STORE = "snapshots";
export const PREFS_STORE = "prefs";

/**
 * A new connection is opened per call rather than cached at module scope:
 * these stores are read/written on trip load, not in a hot loop, so the
 * extra `indexedDB.open` round trip is negligible and this keeps callers
 * trivially testable (each test simply uses a distinct key) without a
 * test-only reset hook in production code.
 */
export async function getTravelHubDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(SNAPSHOTS_STORE)) {
        db.createObjectStore(SNAPSHOTS_STORE);
      }
      if (!db.objectStoreNames.contains(PREFS_STORE)) {
        db.createObjectStore(PREFS_STORE);
      }
    },
  });
}
