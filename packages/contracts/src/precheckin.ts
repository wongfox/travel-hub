import { z } from "zod";

/**
 * Accepted ID document types. The spec names this TBD ("DNI, passport,
 * other" — exact accepted set pending business decision); `OTHER` keeps the
 * schema usable without inventing a fixed final list.
 */
export const DocumentTypeSchema = z.enum(["DNI", "PASSPORT", "OTHER"]);
export type DocumentType = z.infer<typeof DocumentTypeSchema>;

/**
 * Per-passenger pre-check-in completion state. This is the ONLY thing any
 * status endpoint may return — never the submitted photo/ID bytes
 * (`pre-check-in` "ID images are never re-displayed" requirement).
 */
export const PrecheckinStatusSchema = z.enum(["none", "received", "unavailable"]);
export type PrecheckinStatus = z.infer<typeof PrecheckinStatusSchema>;

const PrecheckinPassengerStatusSchema = z
  .object({
    passengerOrdinal: z.number().int().nonnegative(),
    status: PrecheckinStatusSchema,
  })
  .strict();

/**
 * `GET /api/precheckin/status` response body — status only, per passenger.
 * `.strict()` makes it a schema-level guarantee that no extra field (e.g.
 * image data) can ride along on this response.
 */
export const PrecheckinStatusResponseSchema = z.array(PrecheckinPassengerStatusSchema);
export type PrecheckinStatusResponse = z.infer<typeof PrecheckinStatusResponseSchema>;

/**
 * The non-file fields sent alongside the multipart image upload to
 * `POST /api/precheckin/:passengerOrdinal`. The images themselves are raw
 * multipart parts, not represented in this JSON schema.
 */
export const PrecheckinSubmissionMetadataSchema = z.object({
  docType: DocumentTypeSchema,
  consentRecordId: z.string().min(1),
});
export type PrecheckinSubmissionMetadata = z.infer<
  typeof PrecheckinSubmissionMetadataSchema
>;
