import { describe, expect, it } from "vitest";
import { createSirPosStub } from "./stub.js";

const SALE = {
  reservationRef: "RES-1001",
  passengerRef: "PAX-1",
  packageCode: "wifi-60",
  amountMinor: 1500,
  currency: "PEN",
};

describe("createSirPosStub", () => {
  it("registerSale returns a non-empty saleRef", async () => {
    const stub = createSirPosStub();

    const result = await stub.registerSale(SALE, "idem-1");

    expect(result.saleRef.length).toBeGreaterThan(0);
  });

  it("registerSale is idempotent per idempotencyKey: a repeated call returns the same saleRef, not a second POS entry", async () => {
    const stub = createSirPosStub();

    const first = await stub.registerSale(SALE, "idem-2");
    const second = await stub.registerSale(SALE, "idem-2");

    expect(second.saleRef).toBe(first.saleRef);
    expect(stub.registerCalls).toHaveLength(2);
  });

  it("voidSale records the call against a previously registered sale", async () => {
    const stub = createSirPosStub();
    const { saleRef } = await stub.registerSale(SALE, "idem-3");

    await stub.voidSale(saleRef, "refunded");

    expect(stub.voidCalls).toEqual([{ saleRef, reason: "refunded" }]);
  });

  it("simulateFailureOnce makes the next registerSale call reject once, then succeed", async () => {
    const stub = createSirPosStub();
    stub.simulateFailureOnce();

    await expect(stub.registerSale(SALE, "idem-4")).rejects.toThrow(/simulated SirPosPort failure/);
    const result = await stub.registerSale(SALE, "idem-4");
    expect(result.saleRef.length).toBeGreaterThan(0);
  });
});
