import "fake-indexeddb/auto";
import { openDB } from "idb";
import { afterEach, describe, expect, it } from "vitest";
import { ANALYTICS_QUEUE_STORE, DB_NAME, PREFS_STORE, SNAPSHOTS_STORE, getTravelHubDb } from "./travelhub-db.js";

describe("getTravelHubDb", () => {
  // Each test below opens `DB_NAME` at a deliberately OLD version to
  // simulate a pre-upgrade device; fake-indexeddb persists the database
  // globally across tests in this file (there is no real per-test browser
  // profile to isolate them), so without this, the second test's "legacy"
  // open would fail against the version the first test already upgraded to.
  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });

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

  it("adds the analyticsQueue store for a device that already has a v2 database (task 12.1)", async () => {
    // Simulate a device that already ran the pre-WU22 build, which only ever
    // created SNAPSHOTS_STORE + PREFS_STORE, at whatever version that build
    // shipped with (DB_VERSION 2).
    const legacyDb = await openDB(DB_NAME, 2, {
      upgrade(db) {
        db.createObjectStore(SNAPSHOTS_STORE);
        db.createObjectStore(PREFS_STORE);
      },
    });
    legacyDb.close();

    const db = await getTravelHubDb();

    expect(db.objectStoreNames.contains(SNAPSHOTS_STORE)).toBe(true);
    expect(db.objectStoreNames.contains(PREFS_STORE)).toBe(true);
    expect(db.objectStoreNames.contains(ANALYTICS_QUEUE_STORE)).toBe(true);
    db.close();
  });
});
