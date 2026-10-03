import type { TicketDTO, TripDTO } from "contracts";
import { TRIP_SNAPSHOT_SCHEMA_VERSION, type OfflineTicket, type TripSnapshot } from "./trip-snapshot.js";

function toOfflineTicket(document: TicketDTO): OfflineTicket {
  return {
    kind: document.kind,
    title: document.title,
    ...(document.barcodePayload !== undefined ? { barcodePayload: document.barcodePayload } : {}),
    ...(document.fileId !== undefined ? { fileId: document.fileId } : {}),
  };
}

/**
 * Maps a `GET /api/trip` `TripDTO` into the narrower offline `TripSnapshot`
 * shape (design Data Model "Client-side"; task 7.1). Deliberately drops
 * `linkId` (used only as the IndexedDB key, via `trip-prefs-store.ts`'s
 * active-link tracking, not persisted inside the record itself), `features`
 * and `nextMilestone` (server-resolved, not part of the design's snapshot
 * shape), and each passenger's `precheckinStatus` (pre check-in state is
 * never cached offline, per spec `offline-trip-data` "Sensitive data
 * excluded from offline cache").
 */
export function toTripSnapshot(trip: TripDTO): TripSnapshot {
  return {
    schemaVersion: TRIP_SNAPSHOT_SCHEMA_VERSION,
    reservationRefMasked: trip.reservationRefMasked,
    passengers: trip.passengers.map((passenger) => ({
      ordinal: passenger.ordinal,
      displayName: passenger.displayName,
    })),
    legs: trip.legs,
    boardingPasses: trip.boardingPasses,
    tickets: trip.documents.map(toOfflineTicket),
    alerts: trip.alerts,
    fetchedAt: trip.fetchedAt,
    expiresAt: trip.expiresAt,
  };
}
