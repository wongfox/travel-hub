import { describe, it } from "vitest";
import { runConformanceSuite } from "../_conformance-harness/conformance-harness.js";
import { createSirPosStub } from "./stub.js";
import { sirPosContract } from "./sir-pos.contract.js";

describe("SirPosPort conformance (design Decision 6)", () => {
  it("the stub adapter satisfies every conformance case", async () => {
    await runConformanceSuite(() => createSirPosStub(), sirPosContract);
  });
});
