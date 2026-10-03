import { z } from "zod";

/**
 * The three languages the Travel Hub UI chrome ships in at launch
 * (`localization` capability). Source/fallback locale is `es`.
 */
export const LocaleSchema = z.enum(["es", "en", "pt"]);

export type Locale = z.infer<typeof LocaleSchema>;
