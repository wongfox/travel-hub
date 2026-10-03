/**
 * Inca Rail's support WhatsApp number (`help-center`, design capability map:
 * "config (WhatsApp number/prefill)"). Dev-only placeholder in E.164 format
 * (no leading `+`, per WhatsApp's `wa.me` deep-link convention); a real
 * deployment wires this from build-time config (e.g. a Vite env var) rather
 * than a hardcoded constant — the same dev-only-default convention as
 * `composition-root.ts`'s `DEFAULT_DEV_INTERNAL_LINKS_API_KEY`.
 */
export const WHATSAPP_SUPPORT_NUMBER = "51999999999";

/**
 * Builds the `wa.me` deep link (spec `help-center` "WhatsApp button opens a
 * chat"). No prefill text is included — spec names prefill as TBD/configurable,
 * and if ever added it must be limited to a reference identifier, never full
 * trip context (D4).
 */
export function buildWhatsAppDeepLink(supportNumber: string = WHATSAPP_SUPPORT_NUMBER): string {
  return `https://wa.me/${supportNumber}`;
}
