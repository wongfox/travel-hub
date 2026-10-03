import { getTravelHubDb, SNAPSHOTS_STORE } from "./travelhub-db.js";
import { TripSnapshotSchema, type TripSnapshot } from "./trip-snapshot.js";

/**
 * Writes a `TripSnapshot` for the given link id (design: IndexedDB
 * `travelhub` v1, `snapshots` store, keyed by link id). Validates against
 * `TripSnapshotSchema` before persisting so a malformed snapshot never
 * silently corrupts the offline store.
 */
export async function saveTripSnapshot(linkId: string, snapshot: TripSnapshot): Promise<void> {
  const validated = TripSnapshotSchema.parse(snapshot);
  const db = await getTravelHubDb();
  await db.put(SNAPSHOTS_STORE, validated, linkId);
}

/**
 * Reads a previously saved `TripSnapshot`, or `undefined` if none exists
 * for this link id. Never issues a network request — offline data is read
 * exclusively from IndexedDB (spec `offline-trip-data`).
 */
export async function getTripSnapshot(linkId: string): Promise<TripSnapshot | undefined> {
  const db = await getTravelHubDb();
  const raw: unknown = await db.get(SNAPSHOTS_STORE, linkId);
  if (raw === undefined) {
    return undefined;
  }
  return TripSnapshotSchema.parse(raw);
}
