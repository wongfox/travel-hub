import { z } from "zod";

/**
 * BFF error codes (design-interfaces "Error envelope"). The server never
 * returns localized messages — the UI translates `code` client-side.
 */
export const ErrorCodeSchema = z.enum([
  "link_expired",
  "link_revoked",
  "feature_disabled",
  "consent_required",
  "out_of_scope",
  "sir_unavailable",
  "payment_failed",
  "already_submitted",
]);

export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/**
 * The uniform error body every BFF error response returns:
 * `{ code: ErrorCode, requestId: string }`.
 */
export const ErrorEnvelopeSchema = z.object({
  code: ErrorCodeSchema,
  requestId: z.string().min(1),
});

export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;
