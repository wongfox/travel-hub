import { z } from "zod";
import { LocaleSchema } from "./locale.js";

export const FaqEntrySchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  answer: z.string().min(1),
});
export type FaqEntry = z.infer<typeof FaqEntrySchema>;

/**
 * A single onboard-menu item. `.strict()` enforces the locked design
 * decision that the onboard menu is display-only: no add-to-cart, order,
 * quantity, or price field can ever pass validation, so no purchase action
 * can be attached to a menu item even accidentally.
 */
export const MenuItemSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1).optional(),
    imageUrl: z.string().min(1).optional(),
  })
  .strict();
export type MenuItem = z.infer<typeof MenuItemSchema>;

export const MenuSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  items: z.array(MenuItemSchema),
});
export type MenuSection = z.infer<typeof MenuSectionSchema>;

/**
 * Destination-content rich text (how-to-get-there guide, circuit
 * explanations). The POI map itself is a static asset/media id, not
 * modeled as rich text.
 */
export const RichContentSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
});
export type RichContent = z.infer<typeof RichContentSchema>;

/**
 * `ContentPort`'s `ContentResult<T>` envelope (design-interfaces): wraps any
 * content payload with locale/tier fallback flags and a cache ETag.
 */
export function ContentResultSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    data: dataSchema,
    locale: LocaleSchema,
    fallbackLocale: z.boolean(),
    fallbackTier: z.boolean(),
    etag: z.string().min(1),
  });
}
export type ContentResult<T> = {
  data: T;
  locale: z.infer<typeof LocaleSchema>;
  fallbackLocale: boolean;
  fallbackTier: boolean;
  etag: string;
};
