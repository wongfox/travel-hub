import { describe, it } from "vitest";
import { runConformanceSuite } from "../_conformance-harness/conformance-harness.js";
import { createWifiEntitlementStub } from "./stub.js";
import { wifiEntitlementContract } from "./wifi-entitlement.contract.js";

describe("WifiEntitlementPort conformance (design Decision 6/9)", () => {
  it("the stub adapter satisfies every conformance case", async () => {
    await runConformanceSuite(() => createWifiEntitlementStub(), wifiEntitlementContract);
  });
});
