import { randomUUID } from "node:crypto";
import type { PrecheckinHandoffPort } from "../../modules/precheckin/ports.js";

export type PrecheckinHandoffDeliveryPackage = Parameters<PrecheckinHandoffPort["deliver"]>[0];

export interface PrecheckinHandoffStub extends PrecheckinHandoffPort {
  /** Every package this stub instance has "delivered", in call order. Stands in for the undefined downstream consumer (design's own open item). */
  readonly deliveries: PrecheckinHandoffDeliveryPackage[];
  /** Test/dev-only: makes the next `deliver` call reject once, then succeed normally. */
  simulateFailureOnce(): void;
}

/**
 * Deterministic, in-memory `PrecheckinHandoffPort` stub per design Decision 6
 * ("stub (records \"not handed off\")" in the design's port table): the
 * downstream consumer, format, and channel are a business/Legal open item
 * (spec `pre-check-in`'s "Handoff to downstream consumer via port"
 * requirement), so this stub never invents one — it only records that a
 * handoff was attempted, for the `HandoffJob` (task 8.5) to exercise against.
 */
export function createPrecheckinHandoffStub(): PrecheckinHandoffStub {
  const deliveries: PrecheckinHandoffDeliveryPackage[] = [];
  let failNext = false;

  return {
    deliveries,

    simulateFailureOnce() {
      failNext = true;
    },

    async deliver(pkg) {
      if (failNext) {
        failNext = false;
        throw new Error("simulated PrecheckinHandoffPort delivery failure");
      }
      deliveries.push(pkg);
      return { handoffRef: randomUUID() };
    },
  };
}
