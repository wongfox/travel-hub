import { z } from "zod";
import {
  FaqEntrySchema,
  LocaleSchema,
  MenuSectionSchema,
  RichContentSchema,
  ServiceTierSchema,
} from "contracts";

/**
 * Seed JSON shapes for the stub CMS (task 9.1, `services/bff/seed/content/`).
 * Every locale/tier key is optional — `z.partialRecord` (not `z.record`,
 * which requires every enum key present in Zod 4) — so a seed fixture can
 * deliberately omit a locale/tier to exercise `ContentPort`'s fallback logic
 * (e.g. no Portuguese translation proves the `es` fallback).
 */
export const SeedFaqSchema = z.partialRecord(LocaleSchema, z.array(FaqEntrySchema));
export type SeedFaq = z.infer<typeof SeedFaqSchema>;

export const SeedMenuSchema = z.partialRecord(
  ServiceTierSchema,
  z.partialRecord(LocaleSchema, z.array(MenuSectionSchema)),
);
export type SeedMenu = z.infer<typeof SeedMenuSchema>;

export const DestinationSectionSchema = z.enum(["poi_map", "how_to_get_there", "circuits"]);

export const SeedDestinationSchema = z.partialRecord(
  DestinationSectionSchema,
  z.partialRecord(LocaleSchema, RichContentSchema),
);
export type SeedDestination = z.infer<typeof SeedDestinationSchema>;

export const SeedMediaEntrySchema = z.object({
  contentType: z.string().min(1),
  text: z.string().min(1),
});
export const SeedMediaSchema = z.record(z.string(), SeedMediaEntrySchema);
export type SeedMedia = z.infer<typeof SeedMediaSchema>;
