import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ContactChannel } from "../../modules/trip-access/ports.js";
import { BookingNotFoundError } from "../../modules/booking/errors.js";
import type {
  ReissueVerifier,
  ReservationRef,
  SirBookingPort,
  SirRelocation,
  SirReservation,
} from "../../modules/booking/ports.js";
import {
  mapSeedReservationToDomain,
  mapSeedRelocationToDomain,
  parseSeedReservations,
  type SeedReservation,
} from "./mapper.js";

/**
 * Resolves `services/bff/seed/sir/reservations.json` relative to this
 * module's own file location, so the path is correct both when run directly
 * from `src` (tsx/vitest) and from the compiled `dist` output — both mirror
 * the same directory depth under the package root (design Decision 6: seed
 * fixtures live outside `src`, so they are never part of the TS build).
 */
function seedFilePath(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return join(moduleDir, "..", "..", "..", "seed", "sir", "reservations.json");
}

let cachedSeed: SeedReservation[] | undefined;

function loadSeed(): SeedReservation[] {
  if (!cachedSeed) {
    const raw: unknown = JSON.parse(readFileSync(seedFilePath(), "utf-8"));
    cachedSeed = parseSeedReservations(raw);
  }
  return cachedSeed;
}

function findSeedReservation(reservationRef: string): SeedReservation | undefined {
  return loadSeed().find((entry) => entry.reservationRef === reservationRef);
}

/** Last whitespace-separated token of a display name, compared case-insensitively as the "surname". */
function surnameOf(displayName: string): string {
  const tokens = displayName.trim().split(/\s+/);
  return (tokens[tokens.length - 1] ?? "").toLowerCase();
}

/**
 * Deterministic, in-memory `SirBookingPort` stub (design Decision 6) backed
 * by the seed fixtures in `services/bff/seed/sir/`. No real SIR contract is
 * documented yet, so this is the only implementation the rest of the BFF can
 * develop and test against until a vendor adapter exists.
 */
export function createSirBookingStub(): SirBookingPort {
  return {
    async getReservation(ref: ReservationRef): Promise<SirReservation> {
      const seed = findSeedReservation(ref.reservationRef);
      if (!seed) {
        throw new BookingNotFoundError(ref.reservationRef);
      }
      return mapSeedReservationToDomain(seed);
    },

    async getRelocations(ref: ReservationRef): Promise<SirRelocation[]> {
      const seed = findSeedReservation(ref.reservationRef);
      if (!seed) {
        throw new BookingNotFoundError(ref.reservationRef);
      }
      return seed.relocations.map(mapSeedRelocationToDomain);
    },

    async getContactForLinkDelivery(
      ref: ReservationRef,
      verifier: ReissueVerifier,
    ): Promise<ContactChannel | null> {
      const seed = findSeedReservation(ref.reservationRef);
      if (!seed) {
        // Uniform response for unknown reservation vs. non-matching verifier:
        // never confirms or denies which part was wrong (no enumeration).
        return null;
      }
      const matches = seed.passengers.some(
        (passenger) => surnameOf(passenger.displayName) === verifier.surname.trim().toLowerCase(),
      );
      if (!matches) {
        return null;
      }
      return seed.contact;
    },
  };
}
