import type { ContentResult, FaqEntry, Locale, MenuSection, RichContent, ServiceTier } from "contracts";

/**
 * The three destination-content sections (`destination-content`, task 9.4,
 * design-interfaces): the static POI map, the how-to-get-there guide, and
 * the circuit explanation. `poi_map`'s `RichContent.body` carries the static
 * map asset's media id (resolved via `getMedia`), not prose — the section
 * still uses the shared `RichContent` envelope so `ContentPort` has one
 * return shape per content family, matching design-interfaces exactly.
 */
export type DestinationSection = "poi_map" | "how_to_get_there" | "circuits";

export const DESTINATION_SECTIONS: readonly DestinationSection[] = [
  "poi_map",
  "how_to_get_there",
  "circuits",
];

export function isDestinationSection(value: string): value is DestinationSection {
  return (DESTINATION_SECTIONS as readonly string[]).includes(value);
}

/**
 * `ContentPort` per `sdd/travel-hub-mvp/design-interfaces` (task 9.1):
 * headless-CMS access behind one port, proxied and cached by the BFF
 * (design Decision 10). `getFaq`/`getDestination` resolve locale fallback
 * only; `getMenu` additionally resolves tier fallback before locale
 * fallback, since the onboard menu is both tier- and locale-scoped.
 */
export interface ContentPort {
  getFaq(locale: Locale): Promise<ContentResult<FaqEntry[]>>;
  getMenu(tier: ServiceTier, locale: Locale): Promise<ContentResult<MenuSection[]>>;
  getDestination(section: DestinationSection, locale: Locale): Promise<ContentResult<RichContent>>;
  getMedia(id: string): Promise<{ contentType: string; body: NodeJS.ReadableStream }>;
}

/** Thrown by `ContentPort.getMedia` and surfaced as `GET /api/content/media/:id`'s 404. */
export class ContentMediaNotFoundError extends Error {
  constructor(id: string) {
    super(`No media found for id "${id}"`);
    this.name = "ContentMediaNotFoundError";
  }
}

/** Thrown by `ContentPort.getDestination` for an id outside `DestinationSection`'s closed set, surfaced as a 404. */
export class DestinationSectionNotFoundError extends Error {
  constructor(section: string) {
    super(`No destination section "${section}"`);
    this.name = "DestinationSectionNotFoundError";
  }
}
