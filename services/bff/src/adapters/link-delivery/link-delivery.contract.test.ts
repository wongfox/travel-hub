import { describe, expect, it } from "vitest";
import { runConformanceSuite } from "../_conformance-harness/conformance-harness.js";
import { createLinkDeliveryStub } from "./stub.js";
import { linkDeliveryContract } from "./link-delivery.contract.js";
import type { LinkDeliveryPort } from "../../modules/trip-access/ports.js";

describe("LinkDeliveryPort conformance", () => {
  it("passes the full conformance suite against the stub adapter", async () => {
    await expect(
      runConformanceSuite(createLinkDeliveryStub, linkDeliveryContract),
    ).resolves.toBeUndefined();
  });

  it("fails the conformance suite against an adapter that deviates from the documented contract", async () => {
    function createBrokenAdapter(): LinkDeliveryPort {
      return {
        async deliver(to) {
          if (to.kind === "whatsapp") {
            throw new Error("this broken adapter does not support whatsapp delivery");
          }
        },
      };
    }

    await expect(runConformanceSuite(createBrokenAdapter, linkDeliveryContract)).rejects.toThrow(
      /whatsapp contact channel/,
    );
  });
});
