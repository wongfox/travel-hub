import { describe, expect, it } from "vitest";
import {
  PaymentEventSchema,
  WifiOrderDTOSchema,
  WifiOrderStatusSchema,
  WifiPackageDTOSchema,
} from "./wifi.js";

describe("WifiOrderStatusSchema", () => {
  it("accepts every saga state named in design Decision 8's happy path", () => {
    for (const status of [
      "CREATED",
      "PAYMENT_PENDING",
      "PAID",
      "ENTITLEMENT_ACTIVE",
    ] as const) {
      expect(WifiOrderStatusSchema.parse(status)).toBe(status);
    }
  });

  it("accepts every saga failure state named in design Decision 8", () => {
    for (const status of ["PAYMENT_FAILED", "REFUND_PENDING", "REFUNDED"] as const) {
      expect(WifiOrderStatusSchema.parse(status)).toBe(status);
    }
  });

  it("rejects a status that is not one of the nine saga states", () => {
    expect(() => WifiOrderStatusSchema.parse("PROCESSING")).toThrow();
  });
});

describe("WifiPackageDTOSchema", () => {
  it("round-trips a catalog entry with its resolved localized name and price", () => {
    const pkg = {
      id: "pkg_01",
      code: "WIFI_60MIN",
      name: "60 minutos de WiFi",
      priceMinor: 1500,
      currency: "PEN",
      durationMinutes: 60,
    };

    expect(WifiPackageDTOSchema.parse(pkg)).toEqual(pkg);
  });

  it("rejects a package priced in an unsupported currency", () => {
    expect(() =>
      WifiPackageDTOSchema.parse({
        id: "pkg_02",
        code: "WIFI_120MIN",
        name: "120 minutes of WiFi",
        priceMinor: 2500,
        currency: "EUR",
        durationMinutes: 120,
      }),
    ).toThrow();
  });
});

describe("WifiOrderDTOSchema", () => {
  it("round-trips an order still awaiting SIR registration and e-receipt", () => {
    const order = {
      id: "order_01",
      packageId: "pkg_01",
      status: "ENTITLEMENT_ACTIVE",
      amountMinor: 1500,
      currency: "PEN",
      sirRegistered: false,
      receiptIssued: false,
      entitlementRef: "ent_01",
      entitlementExpiresAt: "2026-10-01T10:00:00.000Z",
      createdAt: "2026-10-01T09:00:00.000Z",
      updatedAt: "2026-10-01T09:00:05.000Z",
    };

    expect(WifiOrderDTOSchema.parse(order)).toEqual(order);
  });

  it("round-trips a failed order with no entitlement granted", () => {
    const order = {
      id: "order_02",
      packageId: "pkg_01",
      status: "PAYMENT_FAILED",
      amountMinor: 1500,
      currency: "PEN",
      sirRegistered: false,
      receiptIssued: false,
      entitlementRef: null,
      entitlementExpiresAt: null,
      createdAt: "2026-10-01T09:00:00.000Z",
      updatedAt: "2026-10-01T09:00:02.000Z",
    };

    expect(WifiOrderDTOSchema.parse(order).entitlementRef).toBeNull();
  });
});

describe("PaymentEventSchema", () => {
  it("accepts a parsed payment-succeeded webhook event", () => {
    const event = {
      type: "payment_succeeded",
      providerRef: "ch_01",
      orderIdempotencyKey: "idem_01",
      amountMinor: 1500,
      currency: "PEN",
      occurredAt: "2026-10-01T09:00:00.000Z",
    };

    expect(PaymentEventSchema.parse(event)).toEqual(event);
  });

  it("rejects an event with a type outside the recognized set", () => {
    expect(() =>
      PaymentEventSchema.parse({
        type: "chargeback",
        providerRef: "ch_02",
        orderIdempotencyKey: null,
        amountMinor: 1500,
        currency: "PEN",
        occurredAt: "2026-10-01T09:00:00.000Z",
      }),
    ).toThrow();
  });
});
