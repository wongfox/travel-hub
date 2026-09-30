import { describe, expect, it } from "vitest";
import { buildRelocationAlerts } from "./build-relocation-alerts.js";
import type { SirRelocation } from "../booking/ports.js";

describe("buildRelocationAlerts", () => {
  it("returns an empty array when there are no relocations", () => {
    expect(buildRelocationAlerts([])).toEqual([]);
  });

  it("maps a relocation into a RELOCATION alert carrying the leg and occurrence time", () => {
    const relocation: SirRelocation = {
      legRef: "L1",
      recordedAt: "2026-10-30T12:00:00-05:00",
      reason: "capacity change",
      newSeat: "3C",
    };

    const [alert] = buildRelocationAlerts([relocation]);

    expect(alert).toMatchObject({
      type: "RELOCATION",
      legId: "L1",
      occurredAt: "2026-10-30T12:00:00-05:00",
    });
    expect(alert?.id).toBeTruthy();
    expect(alert?.titleKey).toBeTruthy();
    expect(alert?.bodyKey).toBeTruthy();
  });

  it("produces a distinct alert id per relocation, even for the same leg", () => {
    const relocations: SirRelocation[] = [
      { legRef: "L1", recordedAt: "2026-10-30T12:00:00-05:00" },
      { legRef: "L1", recordedAt: "2026-10-31T12:00:00-05:00" },
    ];

    const alerts = buildRelocationAlerts(relocations);

    expect(alerts[0]?.id).not.toBe(alerts[1]?.id);
  });

  it("maps every relocation into a banner alert unconditionally (no push-subscription input exists)", () => {
    const relocations: SirRelocation[] = [{ legRef: "L2", recordedAt: "2026-11-01T00:00:00-05:00" }];

    expect(buildRelocationAlerts(relocations)).toHaveLength(1);
  });
});
