import type { ConformanceSpec } from "../_conformance-harness/conformance-harness.js";
import type { LinkDeliveryPort } from "../../modules/trip-access/ports.js";

/**
 * Conformance suite for `LinkDeliveryPort` (design Decision 6): runs
 * against the stub in CI, and against any real adapter once a
 * transactional-channel vendor is chosen (design's Open Questions —
 * `LinkDeliveryPort`'s vendor status is still "channel owner TBD").
 */
export const linkDeliveryContract: ConformanceSpec<LinkDeliveryPort> = {
  cases: [
    {
      name: "delivers a link to an email contact channel without throwing",
      async run(port) {
        await port.deliver({ kind: "email", address: "passenger@example.com" }, "https://app/t#tok", "es");
      },
    },
    {
      name: "delivers a link to a whatsapp contact channel in a different locale without throwing",
      async run(port) {
        await port.deliver({ kind: "whatsapp", address: "+51999999999" }, "https://app/t#tok2", "pt");
      },
    },
  ],
};
