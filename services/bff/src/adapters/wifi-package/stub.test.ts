import { describe, expect, it } from "vitest";
import { createWifiPackageStub } from "./stub.js";

describe("createWifiPackageStub", () => {
  it("lists at least one active package with a non-empty localized name, price and duration", async () => {
    const store = createWifiPackageStub();

    const packages = await store.listActive();

    expect(packages.length).toBeGreaterThan(0);
    for (const pkg of packages) {
      expect(pkg.names.es).toBeTruthy();
      expect(pkg.priceMinor).toBeGreaterThanOrEqual(0);
      expect(pkg.durationMinutes).toBeGreaterThan(0);
    }
  });

  it("findById resolves a seeded package by id; returns null for an unknown id", async () => {
    const store = createWifiPackageStub();
    const [first] = await store.listActive();

    expect((await store.findById(first!.id))?.id).toBe(first!.id);
    expect(await store.findById("UNKNOWN")).toBeNull();
  });
});
