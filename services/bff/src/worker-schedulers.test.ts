import { afterEach, describe, expect, it, vi } from "vitest";
import { scheduleWorkerScans } from "./worker-schedulers.js";
import { loadEnv } from "./config/env.js";

const ALL_QUEUES = [
  "sample-job",
  "wifi-entitlement-activation",
  "wifi-sir-receipt",
  "analytics-forward",
  "precheckin-handoff",
  "precheckin-purge",
  "journey-poll",
  "push-subscription-purge",
  "pulse-staff-alert-dispatch",
  "pulse-purge",
];

const baseEnv = { DATABASE_URL: "postgres://user:pass@localhost:5432/travel_hub" };

describe("scheduleWorkerScans", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("schedules every periodic scan queue that is registered, never the sample fixture, and stops all of them", async () => {
    vi.useFakeTimers();
    const sendIdempotent = vi.fn().mockResolvedValue(undefined);
    const env = loadEnv({
      ...baseEnv,
      PRECHECKIN_HANDOFF_INTERVAL_SECONDS: "3",
      PRECHECKIN_PURGE_INTERVAL_SECONDS: "3",
      JOURNEY_POLL_INTERVAL_SECONDS: "3",
      PUSH_SUBSCRIPTION_PURGE_INTERVAL_SECONDS: "3",
      STAFF_ALERT_DISPATCH_INTERVAL_SECONDS: "3",
      PULSE_PURGE_INTERVAL_SECONDS: "3",
      ANALYTICS_FORWARD_INTERVAL_SECONDS: "3",
    });

    const stops = scheduleWorkerScans({ sendIdempotent }, ALL_QUEUES, env);
    await vi.advanceTimersByTimeAsync(60_000); // wifi scans keep their fixed 60s cadence; the rest tick every 3s

    const queues = sendIdempotent.mock.calls.map((c) => c[0] as string);
    expect(new Set(queues)).toEqual(
      new Set([
        "wifi-entitlement-activation",
        "wifi-sir-receipt",
        "analytics-forward",
        "precheckin-handoff",
        "precheckin-purge",
        "journey-poll",
        "push-subscription-purge",
        "pulse-staff-alert-dispatch",
        "pulse-purge",
      ]),
    );
    expect(queues).not.toContain("sample-job");

    for (const stop of stops) stop();
    sendIdempotent.mockClear();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sendIdempotent).not.toHaveBeenCalled();
  });

  it("schedules nothing for queues that are not registered", async () => {
    vi.useFakeTimers();
    const sendIdempotent = vi.fn().mockResolvedValue(undefined);
    const stops = scheduleWorkerScans({ sendIdempotent }, ["sample-job", "pulse-purge"], loadEnv({ ...baseEnv, PULSE_PURGE_INTERVAL_SECONDS: "2" }));

    await vi.advanceTimersByTimeAsync(2000);
    expect(sendIdempotent.mock.calls.map((c) => c[0])).toEqual(["pulse-purge"]);
    expect(stops).toHaveLength(1);
    stops.forEach((s) => s());
  });

  it("uses each configured interval and defaults (60s polls, 3600s purges)", async () => {
    vi.useFakeTimers();
    const sendIdempotent = vi.fn().mockResolvedValue(undefined);
    const stops = scheduleWorkerScans({ sendIdempotent }, ALL_QUEUES, loadEnv(baseEnv));

    await vi.advanceTimersByTimeAsync(60_000);
    const first = new Set(sendIdempotent.mock.calls.map((c) => c[0] as string));
    expect(first.has("precheckin-handoff") && first.has("journey-poll") && first.has("pulse-staff-alert-dispatch")).toBe(true);
    expect(first.has("pulse-purge") || first.has("precheckin-purge") || first.has("push-subscription-purge")).toBe(false);

    await vi.advanceTimersByTimeAsync(3_600_000 - 60_000);
    const later = new Set(sendIdempotent.mock.calls.map((c) => c[0] as string));
    expect(later.has("pulse-purge") && later.has("precheckin-purge") && later.has("push-subscription-purge")).toBe(true);
    stops.forEach((s) => s());
  });
});
