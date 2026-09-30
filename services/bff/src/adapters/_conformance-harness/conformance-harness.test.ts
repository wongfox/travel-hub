import { describe, expect, it } from "vitest";
import { runConformanceSuite, type ConformanceSpec } from "./conformance-harness.js";

interface FakePort {
  getValue(): number;
}

function createCompliantAdapter(): FakePort {
  return { getValue: () => 42 };
}

function createNonCompliantAdapter(): FakePort {
  return { getValue: () => -1 };
}

const spec: ConformanceSpec<FakePort> = {
  cases: [
    {
      name: "getValue returns a positive number",
      async run(port) {
        const value = port.getValue();
        if (value <= 0) throw new Error(`expected a positive value, got ${value}`);
      },
    },
  ],
};

describe("runConformanceSuite", () => {
  it("resolves without throwing when the adapter satisfies every case", async () => {
    await expect(runConformanceSuite(createCompliantAdapter, spec)).resolves.toBeUndefined();
  });

  it("throws, naming the failing case, when the adapter deviates from the contract", async () => {
    await expect(runConformanceSuite(createNonCompliantAdapter, spec)).rejects.toThrow(
      /getValue returns a positive number/,
    );
  });
});
