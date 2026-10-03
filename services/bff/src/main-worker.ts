/**
 * Entry point for the `worker` process (sagas, dispatch, purges, polling).
 */
import { startWorker } from "./composition-root.js";
import { loadEnv } from "./config/env.js";
import { createPgBossQueueClient } from "./infra/queue/pg-boss-queue-client.js";
import { FLAG_DEFAULTS } from "./config/flags.js";
import { scheduleWifiOrderScans, WIFI_ENTITLEMENT_ACTIVATION_QUEUE } from "./modules/wifi-checkout/wifi-order-jobs.js";
import { DEFAULT_ALERT_SOURCE_POLICY } from "./config/alert-source-policy.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const queueClient = createPgBossQueueClient(env.DATABASE_URL);
  const result = await startWorker({
    queueClient,
    precheckin: {
      // Task 8.5: real env-sourced config, so the go-live guard
      // (config/go-live-guards.ts) actually enforces its prerequisites
      // against this worker's real boot-time configuration, not a stub.
      flags: FLAG_DEFAULTS,
      nodeEnv: env.NODE_ENV,
      adapterPrecheckinHandoff: env.ADAPTER_PRECHECKIN_HANDOFF,
      ...(env.PRECHECKIN_RETENTION_POLICY_ID ? { retentionPolicyId: env.PRECHECKIN_RETENTION_POLICY_ID } : {}),
      ...(env.PRECHECKIN_RETENTION_DAYS
        ? {
            retention: {
              retentionDays: env.PRECHECKIN_RETENTION_DAYS,
              handoffGraceMs: (env.PRECHECKIN_HANDOFF_GRACE_DAYS ?? 7) * 24 * 60 * 60 * 1000,
            },
          }
        : {}),
      ...(env.PRECHECKIN_CONSENT_TEXT_VERSION ? { consentTextVersion: env.PRECHECKIN_CONSENT_TEXT_VERSION } : {}),
      kmsKeyConfigured: Boolean(env.PRECHECKIN_KMS_KEY_ID),
      ...(env.PRECHECKIN_KMS_KEY_ID ? { keyId: env.PRECHECKIN_KMS_KEY_ID } : {}),
    },
    wifiCheckout: {
      // Task 10.3: real env-sourced config, so the go-live guard
      // (config/go-live-guards.ts) actually enforces its prerequisites
      // against this worker's real boot-time configuration, not a stub.
      flags: FLAG_DEFAULTS,
      nodeEnv: env.NODE_ENV,
      adapterPayment: env.ADAPTER_PAYMENT,
      adapterReceipt: env.ADAPTER_RECEIPT,
      adapterSirPos: env.ADAPTER_SIR_POS,
      adapterWifiEntitlement: env.ADAPTER_WIFI_ENTITLEMENT,
    },
    notifications: {
      // Task 11.2: real env-sourced config, so the go-live guard
      // (config/go-live-guards.ts) actually enforces its prerequisites
      // against this worker's real boot-time configuration, not a stub.
      flags: FLAG_DEFAULTS,
      nodeEnv: env.NODE_ENV,
      adapterWebPush: env.ADAPTER_WEB_PUSH,
      vapidConfigured: Boolean(env.PUSH_VAPID_PUBLIC_KEY && env.PUSH_VAPID_PRIVATE_KEY),
      alertSourcePolicy: DEFAULT_ALERT_SOURCE_POLICY,
      ...(env.PUSH_CONSENT_TEXT_VERSION ? { pushConsentTextVersion: env.PUSH_CONSENT_TEXT_VERSION } : {}),
    },
    pulse: {
      // Task 11.5: real env-sourced config, so the go-live guard
      // (config/go-live-guards.ts) actually enforces its prerequisites
      // against this worker's real boot-time configuration, not a stub.
      flags: FLAG_DEFAULTS,
      nodeEnv: env.NODE_ENV,
      adapterStaffAlert: env.ADAPTER_STAFF_ALERT,
      ...(env.STAFF_ALERT_RECEIVER_ID ? { staffAlertReceiverId: env.STAFF_ALERT_RECEIVER_ID } : {}),
      ...(env.STAFF_ALERT_PROTOCOL_REF ? { staffAlertProtocolRef: env.STAFF_ALERT_PROTOCOL_REF } : {}),
      ...(env.STAFF_ALERT_RETENTION_DAYS ? { staffAlertRetentionDays: env.STAFF_ALERT_RETENTION_DAYS } : {}),
    },
    // Task 12.1: registers the analytics forward job. `analyticsEventStore`
    // defaults to a fresh in-memory instance — same documented gap as
    // `notifications.accessLinkStore` above (a real deployment needs this to
    // be the SAME store the `api` process's `buildApp({ analytics })`
    // writes to, pending a Drizzle-backed `analytics_event` adapter; see
    // `sdd/travel-hub-mvp/apply-progress`).
    analytics: {
      adapterAnalyticsSink: env.ADAPTER_ANALYTICS_SINK,
      ...(env.ANALYTICS_TRIP_HASH_SECRET ? { secret: env.ANALYTICS_TRIP_HASH_SECRET } : {}),
    },
  });
  // The scan jobs only run when something enqueues them; nothing else does
  // (the payment webhook just marks the order PAID), so schedule them here.
  if (result.jobsRegistered.includes(WIFI_ENTITLEMENT_ACTIVATION_QUEUE)) {
    scheduleWifiOrderScans(queueClient);
  }
  console.log(`worker booted with ${result.jobsRegistered.length} job(s) registered`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
