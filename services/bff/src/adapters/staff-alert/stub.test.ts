import { describe, expect, it } from "vitest";
import { createStaffAlertStub } from "./stub.js";

const PAYLOAD = {
  alertId: "alert-1",
  reservationRef: "RES-1001",
  passengerOrdinal: 1,
  leg: { origin: "Ollantaytambo", destination: "Machu Picchu Pueblo", departureLocal: "2026-11-02T08:10:00-05:00" },
  returnLegDepartureLocal: null,
  serviceTier: "PRIME" as const,
  score: 1,
  scaleMax: 5,
  answeredAt: "2026-11-02T08:15:00.000Z",
  passengerLocale: "es" as const,
};

describe("createStaffAlertStub", () => {
  it("records the delivery and returns a deliveryRef", async () => {
    const stub = createStaffAlertStub();

    const result = await stub.send(PAYLOAD, "idem-1");

    expect(result.deliveryRef).toBeTruthy();
    expect(stub.deliveries).toEqual([PAYLOAD]);
  });

  it("is idempotent per idempotencyKey: a retried send returns the same deliveryRef without a second recorded delivery", async () => {
    const stub = createStaffAlertStub();
    const first = await stub.send(PAYLOAD, "idem-1");

    const second = await stub.send(PAYLOAD, "idem-1");

    expect(second.deliveryRef).toBe(first.deliveryRef);
    expect(stub.deliveries).toHaveLength(1);
  });

  it("simulateFailureOnce makes the next send() reject once, then succeed normally", async () => {
    const stub = createStaffAlertStub();
    stub.simulateFailureOnce();

    await expect(stub.send(PAYLOAD, "idem-1")).rejects.toThrow();
    await expect(stub.send(PAYLOAD, "idem-1")).resolves.toMatchObject({ deliveryRef: expect.any(String) });
  });
});
