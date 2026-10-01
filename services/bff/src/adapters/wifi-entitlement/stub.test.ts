import { describe, expect, it } from "vitest";
import { createWifiEntitlementStub } from "./stub.js";

const GRANT_INPUT = { orderId: "order-1", packageCode: "wifi-60", durationMinutes: 60, legRef: "LEG-1" };

describe("createWifiEntitlementStub", () => {
  it("grant returns a non-empty entitlementRef", async () => {
    const stub = createWifiEntitlementStub();

    const result = await stub.grant(GRANT_INPUT);

    expect(result.entitlementRef.length).toBeGreaterThan(0);
  });

  it("grant is idempotent per orderId: a repeated grant for the same order returns the same entitlementRef", async () => {
    const stub = createWifiEntitlementStub();

    const first = await stub.grant(GRANT_INPUT);
    const second = await stub.grant(GRANT_INPUT);

    expect(second.entitlementRef).toBe(first.entitlementRef);
    expect(stub.grantCalls).toHaveLength(2);
  });

  it("buildRedemption returns a url/code redemption for a granted entitlement", async () => {
    const stub = createWifiEntitlementStub();
    const { entitlementRef } = await stub.grant(GRANT_INPUT);

    const redemption = await stub.buildRedemption(entitlementRef);

    expect(["url", "code"]).toContain(redemption.kind);
    expect(redemption.value.length).toBeGreaterThan(0);
  });

  it("status reflects granted state after grant, and revoke moves it to revoked", async () => {
    const stub = createWifiEntitlementStub();
    const { entitlementRef } = await stub.grant(GRANT_INPUT);

    expect((await stub.status(entitlementRef)).state).toBe("granted");

    await stub.revoke(entitlementRef);

    expect((await stub.status(entitlementRef)).state).toBe("revoked");
  });

  it("simulateFailureOnce makes the next grant call reject once, then succeed", async () => {
    const stub = createWifiEntitlementStub();
    stub.simulateFailureOnce();

    await expect(stub.grant(GRANT_INPUT)).rejects.toThrow(/simulated WifiEntitlementPort failure/);
    const result = await stub.grant(GRANT_INPUT);
    expect(result.entitlementRef.length).toBeGreaterThan(0);
  });
});
