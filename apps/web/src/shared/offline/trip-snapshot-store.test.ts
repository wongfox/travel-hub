import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getTripSnapshot, saveTripSnapshot } from "./trip-snapshot-store.js";
import type { TripSnapshot } from "./trip-snapshot.js";

const fixture: TripSnapshot = {
  schemaVersion: 1,
  reservationRefMasked: "RES***42",
  passengers: [{ ordinal: 1, displayName: "A. Traveler" }],
  legs: [
    {
      id: "leg-1",
      origin: "OLL",
      destination: "AGU",
      departureLocal: "2026-10-01T08:00:00-05:00",
      arrivalLocal: "2026-10-01T09:30:00-05:00",
      tier: "VOYAGER",
      status: "SCHEDULED",
    },
  ],
  boardingPasses: [
    {
      legId: "leg-1",
      barcodeFormat: "QR",
      barcodePayload: "payload-1",
      seat: "12A",
      coach: "C",
      tier: "VOYAGER",
    },
  ],
  tickets: [{ kind: "TRAIN", title: "Train ticket", barcodePayload: "payload-1" }],
  alerts: [],
  fetchedAt: "2026-09-30T12:00:00Z",
  expiresAt: "2026-10-02T12:00:00Z",
};

describe("trip snapshot store", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns undefined when no snapshot has been saved for a link id", async () => {
    const result = await getTripSnapshot("link-missing");

    expect(result).toBeUndefined();
  });

  it("round-trips a saved snapshot", async () => {
    await saveTripSnapshot("link-1", fixture);

    const result = await getTripSnapshot("link-1");

    expect(result).toEqual(fixture);
  });

  it("rejects a snapshot that fails schema validation instead of silently persisting it", async () => {
    const invalid = { ...fixture, schemaVersion: 2 } as unknown as TripSnapshot;

    await expect(saveTripSnapshot("link-invalid", invalid)).rejects.toThrow();
  });

  it("never calls fetch when reading from the offline store", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await saveTripSnapshot("link-2", fixture);
    await getTripSnapshot("link-2");

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
