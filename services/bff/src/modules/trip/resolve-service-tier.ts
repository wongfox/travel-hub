import { ServiceTierSchema, type ServiceTier } from "contracts";

/**
 * `service-tier-experience` tier resolution (task 6.1). No SIR contract is
 * documented yet (design Decision 6): a real adapter may one day hand back a
 * tier code the domain does not recognize despite the compile-time `SirLeg`
 * type. This is the one place allowed to see that raw, untyped value and
 * resolve it, defaulting to the neutral `"UNKNOWN"` fallback
 * (`service-tier-experience` "Neutral fallback when tier is unknown")
 * instead of throwing or propagating a bad value into `TripDTO`.
 */
export function resolveServiceTier(raw: unknown): ServiceTier {
  const parsed = ServiceTierSchema.safeParse(raw);
  return parsed.success ? parsed.data : "UNKNOWN";
}
