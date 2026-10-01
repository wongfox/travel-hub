import { z } from "zod";
import { LocaleSchema } from "./locale.js";
import { ServiceTierSchema } from "./service-tier.js";

/**
 * Faces-scale score range. The exact scale and negative-response threshold
 * are configurable/TBD per the spec; 1-5 is the concrete range this schema
 * enforces until the business owner configures otherwise.
 */
export const PulseScoreSchema = z.number().int().min(1).max(5);
export type PulseScore = z.infer<typeof PulseScoreSchema>;

/**
 * `POST /api/pulse` request body.
 */
export const SubmitPulseRequestSchema = z.object({
  legId: z.string().min(1),
  score: PulseScoreSchema,
});
export type SubmitPulseRequest = z.infer<typeof SubmitPulseRequestSchema>;

/**
 * `POST /api/pulse/prompt` request body (task 11.6): requests best-effort
 * push delivery of the in-trip pulse prompt for one leg. This is its own,
 * independent delivery path — deliberately not a `DELAY`/`RELOCATION`/
 * `INCIDENT` journey event, so it never goes through `dispatchJourneyEvents`'s
 * `AlertSourcePolicy`/dedupe pipeline.
 */
export const PulsePromptRequestSchema = z.object({
  legId: z.string().min(1),
});
export type PulsePromptRequest = z.infer<typeof PulsePromptRequestSchema>;

/**
 * D4a minimal staff-alert payload (design-interfaces `StaffAlertPayload`).
 * `.strict()` is load-bearing: it is the mechanism that enforces "no
 * passenger name, email, phone, document number, or free text" at the type
 * layer, not just by omission — any extra field fails validation instead of
 * being silently accepted.
 */
export const StaffAlertPayloadSchema = z
  .object({
    alertId: z.string().min(1),
    reservationRef: z.string().min(1),
    passengerOrdinal: z.number().int().nonnegative(),
    leg: z.object({
      origin: z.string().min(1),
      destination: z.string().min(1),
      departureLocal: z.string().min(1),
    }),
    returnLegDepartureLocal: z.string().min(1).nullable(),
    serviceTier: ServiceTierSchema,
    score: z.number(),
    scaleMax: z.number(),
    answeredAt: z.string().min(1),
    passengerLocale: LocaleSchema,
  })
  .strict();
export type StaffAlertPayload = z.infer<typeof StaffAlertPayloadSchema>;
