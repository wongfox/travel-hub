import type { Locale } from "contracts";
import type { ContactChannel, LinkDeliveryPort } from "../../modules/trip-access/ports.js";

export interface LinkDeliveryStubRecord {
  to: ContactChannel;
  linkUrl: string;
  locale: Locale;
}

export interface LinkDeliveryStub extends LinkDeliveryPort {
  /** Every delivery this stub instance has accepted, in call order. */
  readonly deliveries: LinkDeliveryStubRecord[];
  /** Test/dev-only: makes the next `deliver` call reject once, then succeed normally. */
  simulateFailureOnce(): void;
}

/**
 * Deterministic, in-memory `LinkDeliveryPort` stub per design Decision 6:
 * every external dependency gets a stub adapter first (deterministic,
 * seeded, failure-injection switch) before a real adapter exists. This is
 * the port task 3.7 uses to demonstrate the adapter-port-pattern +
 * conformance-harness convention end to end.
 */
export function createLinkDeliveryStub(): LinkDeliveryStub {
  const deliveries: LinkDeliveryStubRecord[] = [];
  let failNext = false;

  return {
    deliveries,

    simulateFailureOnce() {
      failNext = true;
    },

    async deliver(to: ContactChannel, linkUrl: string, locale: Locale) {
      if (failNext) {
        failNext = false;
        throw new Error("simulated LinkDeliveryPort delivery failure");
      }
      deliveries.push({ to, linkUrl, locale });
    },
  };
}
