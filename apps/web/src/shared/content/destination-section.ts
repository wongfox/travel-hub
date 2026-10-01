/**
 * Mirrors the BFF's `DestinationSection` (`services/bff/src/modules/content/ports.ts`,
 * task 9.4) — kept as a small web-side type rather than importing from `contracts`,
 * since this closed set is an HTTP routing detail (`GET /api/content/destination/:section`),
 * not a shared DTO shape.
 */
export type DestinationSection = "poi_map" | "how_to_get_there" | "circuits";
