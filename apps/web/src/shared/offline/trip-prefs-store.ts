import { getTravelHubDb, PREFS_STORE } from "./travelhub-db.js";

const ACTIVE_LINK_ID_KEY = "activeLinkId";

/**
 * The "last opened" link id (design Data Model "Client-side": IndexedDB
 * `prefs` store — "A device may hold snapshots for several links; the last
 * opened is active."). Used by `use-offline-trip-query.ts` (task 7.1) to
 * know which `TripSnapshot` to read from `trip-snapshot-store.ts` when the
 * live `GET /api/trip` fetch fails (e.g. offline) and there is no `TripDTO`
 * in hand to read a `linkId` from directly.
 */
export async function setActiveLinkId(linkId: string): Promise<void> {
  const db = await getTravelHubDb();
  await db.put(PREFS_STORE, linkId, ACTIVE_LINK_ID_KEY);
}

/** Reads the last-set active link id, or `undefined` if none has ever been set. */
export async function getActiveLinkId(): Promise<string | undefined> {
  const db = await getTravelHubDb();
  const raw: unknown = await db.get(PREFS_STORE, ACTIVE_LINK_ID_KEY);
  return typeof raw === "string" ? raw : undefined;
}
