import { describe, it } from "vitest";
import { runConformanceSuite } from "../_conformance-harness/conformance-harness.js";
import { createPaymentGatewayStub } from "./stub.js";
import { paymentGatewayContract } from "./payment-gateway.contract.js";

describe("PaymentGatewayPort conformance (design Decision 6)", () => {
  it("the stub adapter satisfies every conformance case", async () => {
    await runConformanceSuite(() => createPaymentGatewayStub(), paymentGatewayContract);
  });
});
