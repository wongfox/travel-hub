import { openDB } from "idb";
import { TripSnapshotSchema, type TripSnapshot } from "./trip-snapshot.js";

const DB_NAME = "travelhub";
const DB_VERSION = 1;
const SNAPSHOTS_STORE = "snapshots";

/**
 * A new connection is opened per call rather than cached at module scope:
 * this store is read/written on trip load, not in a hot loop, so the extra
 * `indexedDB.open` round trip is negligible and this keeps the store
 * trivially testable (each test simply uses a distinct link id) without a
 * test-only reset hook in production code.
 */
async function getDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(SNAPSHOTS_STORE)) {
        db.createObjectStore(SNAPSHOTS_STORE);
      }
    },
  });
}

/**
 * Writes a `TripSnapshot` for the given link id (design: IndexedDB
 * `travelhub` v1, `snapshots` store, keyed by link id). Validates against
 * `TripSnapshotSchema` before persisting so a malformed snapshot never
 * silently corrupts the offline store.
 */
export async function saveTripSnapshot(linkId: string, snapshot: TripSnapshot): Promise<void> {
  const validated = TripSnapshotSchema.parse(snapshot);
  const db = await getDb();
  await db.put(SNAPSHOTS_STORE, validated, linkId);
}

/**
 * Reads a previously saved `TripSnapshot`, or `undefined` if none exists
 * for this link id. Never issues a network request — offline data is read
 * exclusively from IndexedDB (spec `offline-trip-data`).
 */
export async function getTripSnapshot(linkId: string): Promise<TripSnapshot | undefined> {
  const db = await getDb();
  const raw: unknown = await db.get(SNAPSHOTS_STORE, linkId);
  if (raw === undefined) {
    return undefined;
  }
  return TripSnapshotSchema.parse(raw);
}
