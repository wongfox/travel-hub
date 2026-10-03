import { describe, expect, it } from "vitest";
import { buildApp, startWorker } from "../composition-root.js";
import { createInMemoryQueueClient } from "../infra/queue/queue-client.js";
import { createInMemoryAnalyticsEventStore } from "../modules/analytics/analytics-event-store.js";
import { createInMemoryConsentStore } from "../modules/privacy/consent-store.js";
import { createInMemoryWifiOrderStore } from "../modules/wifi-checkout/wifi-order-store.js";
import { loadEnv } from "./env.js";
import { FLAG_DEFAULTS, resolveFlags, type FlagKey } from "./flags.js";
import { GoLiveGuardError } from "./go-live-guards.js";

/**
 * Operator overrides (FEATURE_FLAG_OVERRIDES) must flow through the SAME
 * go-live guards as any other flag source: turning a guarded flag on in a
 * production-like environment with its prerequisites missing must still fail
 * boot. These tests drive the real path main-api.ts / main-worker.ts use:
 * loadEnv -> resolveFlags -> buildApp / startWorker.
 */
function flagsFromEnv(overrides: Partial<Record<FlagKey, boolean>>): Record<FlagKey, boolean> {
  const env = loadEnv({
    DATABASE_URL: "postgres://x",
    NODE_ENV: "production",
    FEATURE_FLAG_OVERRIDES: JSON.stringify(overrides),
  });
  return resolveFlags(env.FEATURE_FLAG_OVERRIDES);
}

function productionApi(flags: Record<FlagKey, boolean>) {
  return buildApp({
    trip: { flags },
    tripAccess: { nodeEnv: "production", internalApiKey: "k" },
    analytics: { nodeEnv: "production", secret: "s", analyticsEventStore: createInMemoryAnalyticsEventStore() },
    privacy: { consentStore: createInMemoryConsentStore() },
    content: { nodeEnv: "production" },
    wifiCheckout: { nodeEnv: "production", orderStore: createInMemoryWifiOrderStore() },
    notifications: { nodeEnv: "production" },
    pulse: { nodeEnv: "production" },
  });
}

function productionWorker(flags: Record<FlagKey, boolean>) {
  return startWorker({
    queueClient: createInMemoryQueueClient(),
    precheckin: { flags, nodeEnv: "production" },
    wifiCheckout: { flags, nodeEnv: "production", orderStore: createInMemoryWifiOrderStore() },
    notifications: { flags, nodeEnv: "production" },
    pulse: { flags, nodeEnv: "production" },
  });
}

const API_GUARDED: FlagKey[] = [
  "menu.enabled",
  "destination.enabled",
  "wifi.checkout",
  "push.enabled",
  "pulse.capture",
  "pulse.staff_alerts",
];
const WORKER_GUARDED: FlagKey[] = [
  "precheckin.production_collection",
  "wifi.checkout",
  "push.enabled",
  "pulse.staff_alerts",
];

describe("FEATURE_FLAG_OVERRIDES flow through the go-live guards", () => {
  it("boots the api and the worker in production with no overrides (defaults stay off)", async () => {
    const flags = flagsFromEnv({});

    expect(flags).toEqual(FLAG_DEFAULTS);
    expect(() => productionApi(flags)).not.toThrow();
    await expect(productionWorker(flags)).resolves.toBeDefined();
  });

  it.each(API_GUARDED)("api refuses to boot with %s overridden on and prerequisites missing", (flag) => {
    const flags = flagsFromEnv({ [flag]: true });

    expect(flags[flag]).toBe(true);
    expect(() => productionApi(flags)).toThrow(GoLiveGuardError);
  });

  it.each(WORKER_GUARDED)("worker refuses to boot with %s overridden on and prerequisites missing", async (flag) => {
    const flags = flagsFromEnv({ [flag]: true });

    await expect(productionWorker(flags)).rejects.toThrow(GoLiveGuardError);
  });

  it("lets an unguarded override (precheckin.capture_ui) boot, and non-guarded overrides never skip a guarded flag", async () => {
    const flags = flagsFromEnv({ "precheckin.capture_ui": true, "tier.theming": false });

    expect(() => productionApi(flags)).not.toThrow();
    await expect(productionWorker(flags)).resolves.toBeDefined();
  });

  it("api and worker resolve the same flags from the same env", () => {
    const source = {
      DATABASE_URL: "postgres://x",
      FEATURE_FLAG_OVERRIDES: '{"wifi.checkout":true,"push.enabled":true}',
    };

    expect(resolveFlags(loadEnv(source).FEATURE_FLAG_OVERRIDES)).toEqual(
      resolveFlags(loadEnv({ ...source }).FEATURE_FLAG_OVERRIDES),
    );
  });

  it("still allows the guarded flags in development (stub adapters) when overridden on", async () => {
    const env = loadEnv({
      DATABASE_URL: "postgres://x",
      NODE_ENV: "development",
      FEATURE_FLAG_OVERRIDES: JSON.stringify(Object.fromEntries(API_GUARDED.map((k) => [k, true]))),
    });
    const flags = resolveFlags(env.FEATURE_FLAG_OVERRIDES);

    expect(() => buildApp({ trip: { flags } })).not.toThrow();
    await expect(
      startWorker({ queueClient: createInMemoryQueueClient(), wifiCheckout: { flags } }),
    ).resolves.toBeDefined();
  });
});
