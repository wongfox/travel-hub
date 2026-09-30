import { z } from "zod";

/**
 * Passenger service tier resolved server-side from SIR/boarding-pass data
 * (`service-tier-experience` capability). `UNKNOWN` is the neutral fallback
 * applied when the tier cannot be resolved.
 */
export const ServiceTierSchema = z.enum([
  "VOYAGER",
  "VISTADOME_360",
  "PRIME",
  "FIRST_CLASS",
  "UNKNOWN",
]);

export type ServiceTier = z.infer<typeof ServiceTierSchema>;
