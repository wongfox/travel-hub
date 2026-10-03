import { z } from "zod";
import { AlertDTOSchema, BoardingPassDTOSchema, TicketKindSchema, TripLegSchema } from "contracts";

/**
 * Client-side offline snapshot shape (design Data Model, "Client-side" ->
 * IndexedDB `travelhub` v1 `snapshots` store), keyed by link id. Narrower
 * than the `GET /api/trip` `TripDTO` for two fields, per the design's own
 * snapshot shape:
 *  - `passengers` carries only what rendering a cached trip needs offline
 *    (ordinal + display name), not `precheckinStatus` — pre-check-in state
 *    is never cached offline (spec `offline-trip-data` "Sensitive data
 *    excluded from offline cache").
 *  - `tickets` mirrors the design's exact snapshot shape (`kind`, `title`,
 *    optional `barcodePayload`/`fileId`), not the full `TicketDTO` — `id`
 *    and `milestoneId` exist to route an online fetch, not to render an
 *    already-cached ticket.
 */
export const OfflinePassengerSchema = z.object({
  ordinal: z.number().int().nonnegative(),
  displayName: z.string().min(1),
});
export type OfflinePassenger = z.infer<typeof OfflinePassengerSchema>;

export const OfflineTicketSchema = z.object({
  kind: TicketKindSchema,
  title: z.string().min(1),
  barcodePayload: z.string().min(1).optional(),
  fileId: z.string().min(1).optional(),
});
export type OfflineTicket = z.infer<typeof OfflineTicketSchema>;

export const TRIP_SNAPSHOT_SCHEMA_VERSION = 1;

export const TripSnapshotSchema = z.object({
  schemaVersion: z.literal(TRIP_SNAPSHOT_SCHEMA_VERSION),
  reservationRefMasked: z.string().min(1),
  passengers: z.array(OfflinePassengerSchema),
  legs: z.array(TripLegSchema),
  boardingPasses: z.array(BoardingPassDTOSchema),
  tickets: z.array(OfflineTicketSchema),
  alerts: z.array(AlertDTOSchema),
  fetchedAt: z.string().min(1),
  expiresAt: z.string().min(1),
});
export type TripSnapshot = z.infer<typeof TripSnapshotSchema>;
