import { z } from "zod";
import { ServiceTierSchema } from "./service-tier.js";

/**
 * Alert taxonomy shared by the trip-home banner and push notifications
 * (design Decision 11's `AlertSourcePolicy` keys off this exact set).
 */
export const AlertTypeSchema = z.enum(["DELAY", "RELOCATION", "INCIDENT"]);
export type AlertType = z.infer<typeof AlertTypeSchema>;

export const LegStatusSchema = z.enum([
  "SCHEDULED",
  "DELAYED",
  "RELOCATED",
  "CANCELLED",
  "COMPLETED",
]);
export type LegStatus = z.infer<typeof LegStatusSchema>;

export const TicketKindSchema = z.enum([
  "TRAIN",
  "CONSETTUR",
  "INC_ENTRY",
  "MEAL_TEATIME",
  "OTHER",
]);
export type TicketKind = z.infer<typeof TicketKindSchema>;

/**
 * Passenger-visible subset of the server feature-flag table (design
 * Decision 13), returned by `GET /api/session` as `features`. Server-only
 * flags (`links.issuance`, `precheckin.production_collection`,
 * `pulse.staff_alerts`) are deliberately excluded — they gate backend
 * behavior, not a passenger-facing UI toggle.
 */
export const PassengerFeatureKeySchema = z.enum([
  "precheckinCaptureUi",
  "pushEnabled",
  "pushA2hsPrompt",
  "pulseCapture",
  "wifiCheckout",
  "menuEnabled",
  "destinationEnabled",
  "tierTheming",
  "offlineContent",
]);
export type PassengerFeatureKey = z.infer<typeof PassengerFeatureKeySchema>;

/**
 * `precheckinStatus` mirrors `PrecheckinStatusSchema` in `precheckin.ts`
 * (same three completion states). It is inlined here rather than imported
 * so `trip.ts` has no dependency on the pre-check-in module.
 */
export const PassengerSchema = z.object({
  ordinal: z.number().int().nonnegative(),
  displayName: z.string().min(1),
  precheckinStatus: z.enum(["none", "received", "unavailable"]),
});
export type Passenger = z.infer<typeof PassengerSchema>;

export const TripLegSchema = z.object({
  id: z.string().min(1),
  origin: z.string().min(1),
  destination: z.string().min(1),
  departureLocal: z.string().min(1),
  arrivalLocal: z.string().min(1),
  tier: ServiceTierSchema,
  status: LegStatusSchema,
});
export type TripLeg = z.infer<typeof TripLegSchema>;

/**
 * Boarding pass view (`trip-itinerary`), mirrored into the client-side
 * `TripSnapshot` for offline access.
 */
export const BoardingPassDTOSchema = z.object({
  legId: z.string().min(1),
  barcodeFormat: z.string().min(1),
  barcodePayload: z.string().min(1),
  seat: z.string().min(1),
  coach: z.string().min(1),
  tier: ServiceTierSchema,
});
export type BoardingPassDTO = z.infer<typeof BoardingPassDTOSchema>;

/**
 * A purchased ticket (`travel-documents`): train, Consettur, INC entry, or
 * meal/tea-time, each associated with its owning itinerary milestone.
 */
export const TicketDTOSchema = z.object({
  id: z.string().min(1),
  kind: TicketKindSchema,
  title: z.string().min(1),
  milestoneId: z.string().min(1).nullable(),
  barcodePayload: z.string().min(1).optional(),
  fileId: z.string().min(1).optional(),
});
export type TicketDTO = z.infer<typeof TicketDTOSchema>;

/**
 * In-app banner alert (`trip-home`'s relocation/incident banner), the
 * baseline delivery channel independent of push opt-in.
 */
export const AlertDTOSchema = z.object({
  id: z.string().min(1),
  type: AlertTypeSchema,
  legId: z.string().min(1).nullable(),
  titleKey: z.string().min(1),
  bodyKey: z.string().min(1),
  occurredAt: z.string().min(1),
});
export type AlertDTO = z.infer<typeof AlertDTOSchema>;

export const NextMilestoneSchema = z
  .object({
    legId: z.string().min(1),
    kind: z.string().min(1),
    atLocal: z.string().min(1),
  })
  .nullable();
export type NextMilestone = z.infer<typeof NextMilestoneSchema>;

/**
 * The `GET /api/trip` overview projection — the single payload trip-home,
 * trip-itinerary, travel-documents, and service-tier-experience render from.
 */
export const ConsentTextVersionsSchema = z.object({
  push: z.string().min(1).optional(),
  pulse: z.string().min(1).optional(),
  precheckin: z.string().min(1).optional(),
});
export type ConsentTextVersions = z.infer<typeof ConsentTextVersionsSchema>;

export const TripDTOSchema = z.object({
  linkId: z.string().min(1),
  reservationRefMasked: z.string().min(1),
  expiresAt: z.string().min(1),
  passengers: z.array(PassengerSchema),
  legs: z.array(TripLegSchema),
  boardingPasses: z.array(BoardingPassDTOSchema),
  documents: z.array(TicketDTOSchema),
  alerts: z.array(AlertDTOSchema),
  nextMilestone: NextMilestoneSchema,
  features: z.record(PassengerFeatureKeySchema, z.boolean()),
  /**
   * Currently published consent text versions the web must record for
   * `push`/`pulse`/`precheckin_biometric` (`POST /api/consents`). Omitted entirely when the server
   * has none configured; the web then keeps the gated feature unavailable
   * instead of inventing a version. Not PII.
   */
  consentTextVersions: ConsentTextVersionsSchema.optional(),
  fetchedAt: z.string().min(1),
});
export type TripDTO = z.infer<typeof TripDTOSchema>;
