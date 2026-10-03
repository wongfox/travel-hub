/**
 * Entry point for the `worker` process (sagas, dispatch, purges, polling).
 */
import { startWorker } from "./composition-root.js";
import { loadEnv } from "./config/env.js";
import { createPgBossQueueClient } from "./infra/queue/pg-boss-queue-client.js";
import { resolveFlags } from "./config/flags.js";
import { scheduleWifiOrderScans, WIFI_ENTITLEMENT_ACTIVATION_QUEUE } from "./modules/wifi-checkout/wifi-order-jobs.js";
import { scheduleAnalyticsForward, ANALYTICS_FORWARD_QUEUE } from "./modules/analytics/forward-analytics-events-job.js";
import { DEFAULT_ALERT_SOURCE_POLICY } from "./config/alert-source-policy.js";
import { createDb } from "./infra/db/client.js";
import { createPostgresWifiOrderStore } from "./adapters/wifi-order-store/postgres.js";
import { createPostgresConsentStore } from "./adapters/consent-store/postgres.js";
import { createPostgresAnalyticsEventStore } from "./adapters/analytics-event-store/postgres.js";
import { createPostgresPushSubscriptionStore } from "./adapters/push-subscription-store/postgres.js";
import { createPostgresNotificationStore } from "./adapters/notification-store/postgres.js";
import { createPostgresPiiAccessAudit } from "./adapters/pii-access-audit/postgres.js";

async function main(): Promise<void> {
  const env = loadEnv();
  // FLAG_DEFAULTS < FEATURE_FLAG_OVERRIDES; validated by loadEnv (same source
  // as main-api.ts) and enforced by each module's go-live guard below.
  const flags = resolveFlags(env.FEATURE_FLAG_OVERRIDES);
  const queueClient = createPgBossQueueClient(env.DATABASE_URL);
  // Same DATABASE_URL and store implementation as the api process, so the
  // jobs below see every order the api wrote.
  const db = createDb(env.DATABASE_URL);
  // One append-only audit sink for every job that audits a handoff/purge.
  const piiAccessAudit = createPostgresPiiAccessAudit(db.db);
  const result = await startWorker({
    queueClient,
    precheckin: {
      // Task 8.5: real env-sourced config, so the go-live guard
      // (config/go-live-guards.ts) actually enforces its prerequisites
      // against this worker's real boot-time configuration, not a stub.
      flags,
      nodeEnv: env.NODE_ENV,
      piiAccessAudit,
      adapterPrecheckinHandoff: env.ADAPTER_PRECHECKIN_HANDOFF,
      ...(env.PRECHECKIN_RETENTION_POLICY_ID
        ? { retentionPolicyId: env.PRECHECKIN_RETENTION_POLICY_ID }
        : {}),
      ...(env.PRECHECKIN_RETENTION_DAYS
        ? {
            retention: {
              retentionDays: env.PRECHECKIN_RETENTION_DAYS,
              handoffGraceMs: (env.PRECHECKIN_HANDOFF_GRACE_DAYS ?? 7) * 24 * 60 * 60 * 1000,
            },
          }
        : {}),
      ...(env.PRECHECKIN_CONSENT_TEXT_VERSION
        ? { consentTextVersion: env.PRECHECKIN_CONSENT_TEXT_VERSION }
        : {}),
      kmsKeyConfigured: Boolean(env.PRECHECKIN_KMS_KEY_ID),
      ...(env.PRECHECKIN_KMS_KEY_ID ? { keyId: env.PRECHECKIN_KMS_KEY_ID } : {}),
    },
    wifiCheckout: {
      // Task 10.3: real env-sourced config, so the go-live guard
      // (config/go-live-guards.ts) actually enforces its prerequisites
      // against this worker's real boot-time configuration, not a stub.
      flags,
      nodeEnv: env.NODE_ENV,
      adapterPayment: env.ADAPTER_PAYMENT,
      adapterReceipt: env.ADAPTER_RECEIPT,
      adapterSirPos: env.ADAPTER_SIR_POS,
      adapterWifiEntitlement: env.ADAPTER_WIFI_ENTITLEMENT,
      orderStore: createPostgresWifiOrderStore(db.db),
    },
    notifications: {
      // Task 11.2: real env-sourced config, so the go-live guard
      // (config/go-live-guards.ts) actually enforces its prerequisites
      // against this worker's real boot-time configuration, not a stub.
      flags,
      nodeEnv: env.NODE_ENV,
      // The very tables the api writes: subscriptions to fan out to / purge, notification dedupe, audit.
      subscriptionStore: createPostgresPushSubscriptionStore(db.db),
      notificationStore: createPostgresNotificationStore(db.db),
      piiAccessAudit,
      adapterWebPush: env.ADAPTER_WEB_PUSH,
      vapidConfigured: Boolean(env.PUSH_VAPID_PUBLIC_KEY && env.PUSH_VAPID_PRIVATE_KEY),
      alertSourcePolicy: DEFAULT_ALERT_SOURCE_POLICY,
      ...(env.PUSH_CONSENT_TEXT_VERSION
        ? { pushConsentTextVersion: env.PUSH_CONSENT_TEXT_VERSION }
        : {}),
    },
    pulse: {
      // Task 11.5: real env-sourced config, so the go-live guard
      // (config/go-live-guards.ts) actually enforces its prerequisites
      // against this worker's real boot-time configuration, not a stub.
      flags,
      nodeEnv: env.NODE_ENV,
      piiAccessAudit,
      adapterStaffAlert: env.ADAPTER_STAFF_ALERT,
      ...(env.STAFF_ALERT_RECEIVER_ID ? { staffAlertReceiverId: env.STAFF_ALERT_RECEIVER_ID } : {}),
      ...(env.STAFF_ALERT_PROTOCOL_REF
        ? { staffAlertProtocolRef: env.STAFF_ALERT_PROTOCOL_REF }
        : {}),
      ...(env.STAFF_ALERT_RETENTION_DAYS
        ? { staffAlertRetentionDays: env.STAFF_ALERT_RETENTION_DAYS }
        : {}),
    },
    // Task 12.1: registers the analytics forward job over the SAME Postgres
    // analytics_event / consent_record tables the api process writes to.
    analytics: {
      nodeEnv: env.NODE_ENV,
      analyticsEventStore: createPostgresAnalyticsEventStore(db.db),
      consentStore: createPostgresConsentStore(db.db),
      adapterAnalyticsSink: env.ADAPTER_ANALYTICS_SINK,
      ...(env.ANALYTICS_TRIP_HASH_SECRET ? { secret: env.ANALYTICS_TRIP_HASH_SECRET } : {}),
    },
  });
  // The scan jobs only run when something enqueues them; nothing else does
  // (the payment webhook just marks the order PAID), so schedule them here.
  const stopSchedulers: Array<() => void> = [];
  if (result.jobsRegistered.includes(WIFI_ENTITLEMENT_ACTIVATION_QUEUE)) {
    stopSchedulers.push(scheduleWifiOrderScans(queueClient));
  }
  if (result.jobsRegistered.includes(ANALYTICS_FORWARD_QUEUE)) {
    stopSchedulers.push(
      scheduleAnalyticsForward(queueClient, { intervalMs: env.ANALYTICS_FORWARD_INTERVAL_SECONDS * 1000 }),
    );
  }
  console.log(`worker booted with ${result.jobsRegistered.length} job(s) registered`);

  // The worker is a long-lived process: pg-boss polling keeps the event loop
  // alive, so main() must NOT exit on success. Stop the queue cleanly on a
  // termination signal (docker stop / ECS task stop send SIGTERM).
  const shutdown = (signal: string): void => {
    console.log(`worker received ${signal}, stopping`);
    for (const stopScheduler of stopSchedulers) stopScheduler();
    queueClient
      .stop()
      .then(() => db.close())
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        console.error(error);
        process.exit(1);
      });
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
