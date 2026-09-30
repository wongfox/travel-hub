import "fake-indexeddb/auto";
import { openDB } from "idb";
import { describe, expect, it } from "vitest";
import { DB_NAME, PREFS_STORE, SNAPSHOTS_STORE, getTravelHubDb } from "./travelhub-db.js";

describe("getTravelHubDb", () => {
  it("adds the prefs store for a device that already has a v1 database containing only the snapshots store", async () => {
    // Simulate a device that already ran the pre-WU12 build, which only ever
    // created SNAPSHOTS_STORE, at whatever version that build shipped with.
    const legacyDb = await openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore(SNAPSHOTS_STORE);
      },
    });
    legacyDb.close();

    const db = await getTravelHubDb();

    expect(db.objectStoreNames.contains(SNAPSHOTS_STORE)).toBe(true);
    expect(db.objectStoreNames.contains(PREFS_STORE)).toBe(true);
    db.close();
  });
});
