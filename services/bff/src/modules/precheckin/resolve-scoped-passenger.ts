import type { SirPassenger } from "../booking/ports.js";
import { PassengerNotInScopeError } from "./ports.js";

/**
 * Resolves `:passengerOrdinal` (the HTTP surface's own identifier, per
 * design-interfaces `POST /api/precheckin/:passengerOrdinal`) to the exact
 * `SirPassenger` it names, honoring the access link's own passenger scope —
 * the same scoping rule `get-trip-overview.ts` already applies (empty scope =
 * every passenger). Throws rather than returning `null` so callers cannot
 * accidentally treat "not in scope" as "not found yet" and proceed anyway.
 */
export function resolveScopedPassengerByOrdinal(
  passengers: SirPassenger[],
  passengerScope: string[],
  ordinal: number,
): SirPassenger {
  const scoped =
    passengerScope.length === 0
      ? passengers
      : passengers.filter((passenger) => passengerScope.includes(passenger.passengerRef));

  const found = scoped.find((passenger) => passenger.ordinal === ordinal);
  if (!found) {
    throw new PassengerNotInScopeError(ordinal);
  }
  return found;
}
