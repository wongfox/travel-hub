import type { Locale } from "contracts";

/**
 * `LinkDeliveryPort` per `sdd/travel-hub-mvp/design-interfaces`
 * (`services/bff/src/modules/trip-access/ports.ts`). Delivers an
 * issued/reissued access link to the contact channel on file in SIR.
 * Task 3.7 demonstrates the adapter port pattern + conformance harness on
 * this port specifically because it is the design's own example.
 */
export type ContactChannel =
  | { kind: "email"; address: string }
  | { kind: "sms"; address: string }
  | { kind: "whatsapp"; address: string };

export interface LinkDeliveryPort {
  deliver(to: ContactChannel, linkUrl: string, locale: Locale): Promise<void>;
}
