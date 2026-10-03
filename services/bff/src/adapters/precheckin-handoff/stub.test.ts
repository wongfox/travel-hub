import { describe, expect, it } from "vitest";
import { createPrecheckinHandoffStub } from "./stub.js";

function fakePackage(overrides: Partial<Parameters<ReturnType<typeof createPrecheckinHandoffStub>["deliver"]>[0]> = {}) {
  return {
    submissionId: "sub-1",
    reservationRef: "RES-1001",
    passengerRef: "PAX-1",
    docType: "DNI" as const,
    images: [{ role: "photo" as const, contentType: "image/jpeg", bytes: Buffer.from("plaintext-photo") }],
    idempotencyKey: "sub-1",
    ...overrides,
  };
}

describe("createPrecheckinHandoffStub", () => {
  it("records every delivery and returns a handoffRef, never invoking a real consumer", async () => {
    const stub = createPrecheckinHandoffStub();

    const result = await stub.deliver(fakePackage());

    expect(result.handoffRef).toEqual(expect.any(String));
    expect(stub.deliveries).toHaveLength(1);
    expect(stub.deliveries[0]?.submissionId).toBe("sub-1");
    expect(stub.deliveries[0]?.images[0]?.bytes.toString()).toBe("plaintext-photo");
  });

  it("simulates a delivery failure exactly once when armed", async () => {
    const stub = createPrecheckinHandoffStub();
    stub.simulateFailureOnce();

    await expect(stub.deliver(fakePackage())).rejects.toThrow(/simulated/);
    expect(stub.deliveries).toHaveLength(0);

    const result = await stub.deliver(fakePackage());
    expect(result.handoffRef).toEqual(expect.any(String));
    expect(stub.deliveries).toHaveLength(1);
  });

  it("treats a repeated idempotencyKey as a no-op, returning the same handoffRef without a second delivery", async () => {
    const stub = createPrecheckinHandoffStub();

    const first = await stub.deliver(fakePackage({ idempotencyKey: "sub-dup" }));
    const second = await stub.deliver(fakePackage({ idempotencyKey: "sub-dup" }));

    expect(second.handoffRef).toBe(first.handoffRef);
    expect(stub.deliveries).toHaveLength(1);
  });

  it("delivers independently for distinct idempotencyKeys", async () => {
    const stub = createPrecheckinHandoffStub();

    await stub.deliver(fakePackage({ idempotencyKey: "sub-a" }));
    await stub.deliver(fakePackage({ idempotencyKey: "sub-b" }));

    expect(stub.deliveries).toHaveLength(2);
  });
});
