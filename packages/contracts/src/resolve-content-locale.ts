import type { Locale } from "./locale.js";

/**
 * CMS locale-fallback mechanism (task 7.3, design Decision 10: "locale ->
 * source locale `es`, flagged `fallbackLocale: true` for content-gap
 * analytics"). This is the reusable resolution primitive behind
 * `ContentResult<T>`'s `fallbackLocale` flag; `ContentPort`'s stub adapter
 * (task 9.1) wires the actual CMS lookups into it — this task only builds
 * the mechanism, since CMS content itself has not landed yet.
 */
export interface ResolveLocalizedContentInput<T> {
  /** Content keyed by whichever locales actually have a translation; not every locale needs an entry. */
  byLocale: Partial<Record<Locale, T>>;
  /** The passenger's currently resolved locale. */
  requestedLocale: Locale;
  /** The CMS source/default locale to fall back to (design: `es`). */
  defaultLocale: Locale;
}

export interface ResolvedLocalizedContent<T> {
  data: T;
  locale: Locale;
  fallbackLocale: boolean;
}

/**
 * Thrown when neither the requested locale nor the configured default
 * locale has any content — per spec `localization` "Fallback for missing
 * localized content", the system must never show empty content, but it also
 * cannot fabricate content that does not exist anywhere; callers must
 * surface this as an explicit content-configuration gap, not a silent blank
 * screen.
 */
export class MissingDefaultLocaleContentError extends Error {
  constructor(defaultLocale: Locale) {
    super(`No content found for the default locale "${defaultLocale}"; cannot resolve or fall back.`);
    this.name = "MissingDefaultLocaleContentError";
  }
}

export function resolveLocalizedContent<T>({
  byLocale,
  requestedLocale,
  defaultLocale,
}: ResolveLocalizedContentInput<T>): ResolvedLocalizedContent<T> {
  const requested = byLocale[requestedLocale];
  if (requested !== undefined) {
    return { data: requested, locale: requestedLocale, fallbackLocale: false };
  }

  const fallback = byLocale[defaultLocale];
  if (fallback === undefined) {
    throw new MissingDefaultLocaleContentError(defaultLocale);
  }

  return { data: fallback, locale: defaultLocale, fallbackLocale: true };
}
