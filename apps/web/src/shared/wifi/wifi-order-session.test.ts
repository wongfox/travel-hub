import { afterEach, describe, expect, it } from "vitest";
import { rememberWifiOrderId, resolveWifiOrderId } from "./wifi-order-session.js";

afterEach(() => {
  sessionStorage.clear();
});

describe("wifi order session mapping", () => {
  it("resolves the orderId remembered for an idempotencyKey", () => {
    rememberWifiOrderId("idem-1", "order-1");

    expect(resolveWifiOrderId("idem-1")).toBe("order-1");
  });

  it("returns null for an idempotencyKey that was never remembered", () => {
    expect(resolveWifiOrderId("unknown-key")).toBeNull();
  });

  it("keeps distinct idempotencyKeys independent", () => {
    rememberWifiOrderId("idem-a", "order-a");
    rememberWifiOrderId("idem-b", "order-b");

    expect(resolveWifiOrderId("idem-a")).toBe("order-a");
    expect(resolveWifiOrderId("idem-b")).toBe("order-b");
  });
});
