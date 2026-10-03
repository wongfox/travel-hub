import { describe, it } from "vitest";
import { runConformanceSuite } from "../_conformance-harness/conformance-harness.js";
import { createEReceiptStub } from "./stub.js";
import { eReceiptContract } from "./e-receipt.contract.js";

describe("EReceiptPort conformance (design Decision 6)", () => {
  it("the stub adapter satisfies every conformance case", async () => {
    await runConformanceSuite(() => createEReceiptStub(), eReceiptContract);
  });
});
