import { z } from "zod";
import { LegStatusSchema, ServiceTierSchema } from "contracts";
import type { SirLeg, SirPassenger, SirRelocation, SirReservation } from "../../modules/booking/ports.js";
import type { ContactChannel } from "../../modules/trip-access/ports.js";

/**
 * Raw seed-fixture shape (`services/bff/seed/sir/reservations.json`).
 * Deliberately kept as its own schema, separate from the domain
 * `SirReservation` type in `modules/booking/ports.ts`: this is the one place
 * allowed to know the raw shape a SIR-shaped source hands over, so a real
 * vendor adapter with different field names only ever needs a new mapper,
 * never a change to domain code (design Decision 6).
 */
const SeedContactChannelSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("email"), address: z.string().min(1) }),
  z.object({ kind: z.literal("sms"), address: z.string().min(1) }),
  z.object({ kind: z.literal("whatsapp"), address: z.string().min(1) }),
]);

const SeedPassengerSchema = z.object({
  passengerRef: z.string().min(1),
  ordinal: z.number().int().nonnegative(),
  displayName: z.string().min(1),
});

const SeedLegSchema = z.object({
  legRef: z.string().min(1),
  origin: z.string().min(1),
  destination: z.string().min(1),
  departureLocal: z.string().min(1),
  arrivalLocal: z.string().min(1),
  tier: ServiceTierSchema,
  status: LegStatusSchema,
});

const SeedRelocationSchema = z.object({
  legRef: z.string().min(1),
  recordedAt: z.string().min(1),
  reason: z.string().min(1).optional(),
  newSeat: z.string().min(1).optional(),
});

const SeedReservationSchema = z.object({
  reservationRef: z.string().min(1),
  contact: SeedContactChannelSchema,
  passengers: z.array(SeedPassengerSchema),
  legs: z.array(SeedLegSchema),
  relocations: z.array(SeedRelocationSchema),
});

export type SeedReservation = z.infer<typeof SeedReservationSchema>;

/**
 * Validates raw parsed JSON against the seed shape, throwing a descriptive
 * error naming the violation when a fixture is malformed — a corrupted seed
 * file fails loudly at load time instead of surfacing as a confusing runtime
 * error deep inside the stub adapter.
 */
export function parseSeedReservations(raw: unknown): SeedReservation[] {
  return z.array(SeedReservationSchema).parse(raw);
}

function toContactChannel(contact: SeedReservation["contact"]): ContactChannel {
  return contact;
}

function toPassengers(passengers: SeedReservation["passengers"]): SirPassenger[] {
  return passengers.map((passenger) => ({ ...passenger }));
}

function toLegs(legs: SeedReservation["legs"]): SirLeg[] {
  return legs.map((leg) => ({ ...leg }));
}

/**
 * Anti-corruption mapping: seed/raw shape -> domain `SirReservation`.
 * `relocations` are intentionally excluded — `SirBookingPort.getRelocations`
 * reads them separately (mirroring `SirBookingPort`'s own two-method split).
 */
export function mapSeedReservationToDomain(seed: SeedReservation): SirReservation {
  return {
    reservationRef: seed.reservationRef,
    contact: toContactChannel(seed.contact),
    passengers: toPassengers(seed.passengers),
    legs: toLegs(seed.legs),
  };
}

/**
 * Maps a single seed relocation into the domain `SirRelocation` shape,
 * omitting `reason`/`newSeat` entirely (rather than assigning them a literal
 * `undefined`) when the seed did not provide them — required under this
 * project's `exactOptionalPropertyTypes: true` compiler setting.
 */
export function mapSeedRelocationToDomain(seed: SeedReservation["relocations"][number]): SirRelocation {
  return {
    legRef: seed.legRef,
    recordedAt: seed.recordedAt,
    ...(seed.reason !== undefined ? { reason: seed.reason } : {}),
    ...(seed.newSeat !== undefined ? { newSeat: seed.newSeat } : {}),
  };
}
