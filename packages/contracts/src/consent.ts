import { z } from "zod";

/**
 * Consent purposes tracked in `consent_record` (design Data Model).
 * Append-only, latest-per-purpose-wins.
 */
export const ConsentPurposeSchema = z.enum([
  "analytics",
  "push",
  "pulse",
  "precheckin_biometric",
]);
export type ConsentPurpose = z.infer<typeof ConsentPurposeSchema>;

/**
 * `POST /api/consents` request body.
 */
export const RecordConsentRequestSchema = z.object({
  purpose: ConsentPurposeSchema,
  textVersion: z.string().min(1),
  granted: z.boolean(),
});
export type RecordConsentRequest = z.infer<typeof RecordConsentRequestSchema>;

/**
 * The latest recorded consent state for one purpose, as returned by
 * `GET /api/session`'s consent state and consumed by the reusable
 * consent-required guard.
 */
export const ConsentStateSchema = z.object({
  purpose: ConsentPurposeSchema,
  granted: z.boolean(),
  textVersion: z.string().min(1),
  recordedAt: z.string().min(1),
});
export type ConsentState = z.infer<typeof ConsentStateSchema>;
