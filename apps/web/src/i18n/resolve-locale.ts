import { LocaleSchema, type Locale } from "contracts";

/**
 * Locale resolution order per design Decision 14: explicit user choice ->
 * booking locale hint from SIR (if exposed) -> `navigator.languages` -> `es`
 * (source/fallback locale).
 */
export interface LocaleResolutionInput {
  explicitChoice?: string | null | undefined;
  bookingLocaleHint?: string | null | undefined;
  navigatorLanguages?: readonly string[] | undefined;
}

const SOURCE_LOCALE: Locale = "es";

function coerceLocale(value: string | null | undefined): Locale | null {
  if (!value) {
    return null;
  }
  const candidate = value.slice(0, 2).toLowerCase();
  const parsed = LocaleSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export function resolveLocale(input: LocaleResolutionInput): Locale {
  const fromExplicitChoice = coerceLocale(input.explicitChoice);
  if (fromExplicitChoice) {
    return fromExplicitChoice;
  }

  const fromBookingHint = coerceLocale(input.bookingLocaleHint);
  if (fromBookingHint) {
    return fromBookingHint;
  }

  for (const language of input.navigatorLanguages ?? []) {
    const fromNavigator = coerceLocale(language);
    if (fromNavigator) {
      return fromNavigator;
    }
  }

  return SOURCE_LOCALE;
}
