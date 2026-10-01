import { describe, expect, it, vi } from "vitest";
import { createStaffAlertLogOnlyAdapter } from "./log-only.js";

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

describe("createStaffAlertLogOnlyAdapter", () => {
  it("logs the minimal payload via the injected logger and resolves with a deliveryRef", async () => {
    const log = vi.fn();
    const adapter = createStaffAlertLogOnlyAdapter({ log });

    const result = await adapter.send(PAYLOAD, "idem-1");

    expect(result.deliveryRef).toBeTruthy();
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ payload: PAYLOAD, idempotencyKey: "idem-1" }));
  });
});
